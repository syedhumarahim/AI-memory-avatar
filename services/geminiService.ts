
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MODELS } from "../constants";
import { AvatarProfile, ExplanationAnalysis } from "../types";
import { buildSystemPrompt } from "../utils/promptUtils";

// --- API KEY CONFIGURATION ---
// PASTE YOUR API KEY BETWEEN THE QUOTES BELOW
const HARDCODED_API_KEY = "AIzaSyCz1lrPpm9t07PGx2xeFXl7WjTMRXdr4SA"; 
// -----------------------------

const getAiClient = () => {
  // Uses the hardcoded key if present, otherwise falls back to environment variable
  const key = HARDCODED_API_KEY || process.env.API_KEY;
  if (!key) {
      console.warn("No API Key found. Please set HARDCODED_API_KEY in services/geminiService.ts or process.env.API_KEY");
  }
  return new GoogleGenAI({ apiKey: key });
};

// Retry helper for handling Rate Limits (429)
const retryOperation = async <T>(operation: () => Promise<T>, retries = 3, delay = 4000): Promise<T> => {
  try {
    return await operation();
  } catch (error: any) {
    const isRetryable = 
      error.status === 429 || 
      error.code === 429 || 
      error.message?.includes('429') || 
      error.message?.includes('Quota') ||
      error.status === 503;

    if (isRetryable && retries > 0) {
      console.warn(`API Limit Hit (${error.status || '429'}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryOperation(operation, retries - 1, delay * 2);
    }
    throw error;
  }
};

export const generateAvatarResponse = async (
  profile: AvatarProfile,
  inputText: string,
  history: { role: string; text: string }[]
): Promise<string> => {
  return retryOperation(async () => {
    const ai = getAiClient();
    
    // Filter out previous fallback messages so the AI doesn't learn to repeat "I am listening"
    const cleanHistory = history.filter(msg => 
        msg.text && 
        msg.text.trim().length > 0 && 
        !msg.text.includes("I am listening") &&
        !msg.text.startsWith("(Silence")
    );

    // Context window: Last 6 messages
    const recentHistory = cleanHistory.slice(-6);
    
    // Format history for Gemini
    let contents = [];
    
    // Add history
    recentHistory.forEach(msg => {
       contents.push({
           role: msg.role === 'model' ? 'model' : 'user',
           parts: [{ text: msg.text }]
       });
    });
    
    // Add current message
    contents.push({
        role: 'user',
        parts: [{ text: inputText }]
    });

    const systemInstruction = buildSystemPrompt(profile);

    try {
      const response = await ai.models.generateContent({
        model: MODELS.TEXT,
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          maxOutputTokens: 1000, 
          temperature: 0.9, 
        }
      });

      // Check for valid text
      if (response.text) {
          return response.text;
      }
      
      // If no text, check if it was blocked
      if (response.candidates && response.candidates.length > 0) {
          const reason = response.candidates[0].finishReason;
          if (reason && reason !== 'STOP') {
              console.warn("Gemini generation stopped due to:", reason);
              return `(Silence: ${reason})`; 
          }
      }

      return "I am listening.";
    } catch (error) {
      console.error("Gemini Text Gen Error:", error);
      throw error;
    }
  });
};

export const generateSpeech = async (text: string, voiceName: string): Promise<ArrayBuffer> => {
  return retryOperation(async () => {
    const ai = getAiClient();
    
    const response = await ai.models.generateContent({
      model: MODELS.TTS,
      contents: {
        parts: [{ text: text }]
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' }
          }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    
    // Decode base64 to ArrayBuffer manually
    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  });
};

export const transcribeAudio = async (audioBase64: string, mimeType: string = 'audio/webm'): Promise<string> => {
  return retryOperation(async () => {
    const ai = getAiClient();
    
    try {
        const response = await ai.models.generateContent({
          model: MODELS.TRANSCRIPTION,
          contents: {
            parts: [
              { inlineData: { mimeType: mimeType, data: audioBase64 } },
              { text: "Transcribe the spoken audio exactly. Ignore background noise." }
            ]
          }
        });
        return response.text || "";
    } catch (e) {
        console.error("Transcription error:", e);
        return "";
    }
  });
};

// --- HYBRID EXPLAINABILITY SERVICE ---

/**
 * Helper: Generate embeddings for text using text-embedding-004
 */
const getEmbedding = async (text: string): Promise<number[]> => {
    if (!text || text.length < 2) return Array(768).fill(0);
    const ai = getAiClient();
    try {
        // Truncate simply to avoid token limits on embeddings for this demo
        const truncated = text.substring(0, 2000);
        const result = await ai.models.embedContent({
            model: MODELS.EMBEDDING,
            contents: { parts: [{ text: truncated }] }
        });
        // result.embedding might be deprecated in favor of result.embeddings in some SDK versions
        const embedding = result.embeddings?.[0] || (result as any).embedding;
        return embedding?.values || [];
    } catch (e) {
        console.warn("Embedding failed", e);
        return Array(768).fill(0);
    }
};

/**
 * Helper: Calculate Cosine Similarity between two vectors
 */
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA.length || !vecB.length || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

export const explainResponse = async (
  profile: AvatarProfile,
  userMessage: string,
  botResponse: string
): Promise<ExplanationAnalysis> => {
    const ai = getAiClient();

    try {
        // 1. CALCULATE ACTUAL SCORES (Technical Explainability)
        // We run embeddings in parallel for speed
        const [responseEmb, memEmb, styleEmb, persEmb] = await Promise.all([
            getEmbedding(botResponse),
            getEmbedding(profile.memories),
            getEmbedding(profile.styleSamples),
            getEmbedding(profile.personality)
        ]);

        // Calculate raw cosine similarity (0.0 to 1.0)
        const rawMemScore = cosineSimilarity(responseEmb, memEmb);
        const rawStyleScore = cosineSimilarity(responseEmb, styleEmb);
        const rawPersScore = cosineSimilarity(responseEmb, persEmb);

        // Normalize for UI (0-100). 
        // Semantic similarity usually ranges 0.4-0.9 for related text. 
        // We scale it to make differences visible.
        const normalize = (val: number) => Math.min(100, Math.max(0, Math.round((val - 0.3) * 200))); 

        const finalMemScore = normalize(rawMemScore);
        const finalStyleScore = normalize(rawStyleScore);
        const finalPersScore = normalize(rawPersScore);

        // 2. GENERATE NARRATIVE REASONING (LLM)
        // We feed the *Actual* scores to the LLM so it explains the math, rather than making up numbers.
        const prompt = `
        You are an expert AI Interpretable System Analyst. 
        
        DATA:
        - Bot Name: "${profile.name}"
        - User Input: "${userMessage}"
        - Bot Response: "${botResponse}"
        
        CALCULATED VECTOR SCORES (Cosine Similarity):
        - Personality Alignment: ${finalPersScore}%
        - Memory Retrieval: ${finalMemScore}%
        - Style Match: ${finalStyleScore}%

        TASK:
        Provide a brief "Cognitive Trace" explanation (1-2 sentences).
        Explain WHY the bot responded this way, referencing the scores above.
        For example, if Memory is high, mention it found a relevant memory. If Style is high, mention it matched the tone.

        Return JSON format only.
        `;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        reasoning: { type: Type.STRING, description: "Explanation of the response based on vector scores." }
                    }
                }
            }
        });

        const jsonText = response.text || "{}";
        const result = JSON.parse(jsonText);

        return {
            personalityScore: finalPersScore,
            memoriesScore: finalMemScore,
            styleScore: finalStyleScore,
            reasoning: result.reasoning || "Analysis complete."
        };

    } catch (e) {
        console.error("Explanation failed", e);
        return {
            personalityScore: 0,
            memoriesScore: 0,
            styleScore: 0,
            reasoning: "Could not generate explanation."
        };
    }
};
