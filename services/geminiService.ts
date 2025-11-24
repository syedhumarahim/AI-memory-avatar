
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MODELS } from "../constants";
import { AvatarProfile, ExplanationAnalysis } from "../types";
import { buildSystemPrompt } from "../utils/promptUtils";

// --- API KEY CONFIGURATION ---
// PASTE YOUR API KEY BETWEEN THE QUOTES BELOW
const HARDCODED_API_KEY = "sk_0f1f5fe9ff30abaa5a30cdfe97a25b760e8cb240d97416f6"; 
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

// --- EXPLAINABILITY SERVICE ---

export const explainResponse = async (
  profile: AvatarProfile,
  userMessage: string,
  botResponse: string
): Promise<ExplanationAnalysis> => {
    const ai = getAiClient();

    const prompt = `
    You are an expert AI Interpretable System. 
    Analyze the following interaction where an AI Persona named "${profile.name}" responded to a user.
    
    Bot Persona Definitions:
    1. Personality: ${profile.personality}
    2. Memories: ${profile.memories}
    3. Style: ${profile.styleSamples}

    Interaction:
    User: "${userMessage}"
    Bot Response: "${botResponse}"

    Task:
    Explain WHY the bot generated this specific response.
    Assign a percentage score (0-100) to how much each factor (Personality, Memories, Style) influenced the output.
    Provide a brief "Cognitive Trace" explanation.

    Return JSON format only.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", // Use fast model for analysis
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        personalityScore: { type: Type.NUMBER, description: "Influence of personality traits (0-100)" },
                        memoriesScore: { type: Type.NUMBER, description: "Influence of specific memories (0-100)" },
                        styleScore: { type: Type.NUMBER, description: "Influence of speaking style (0-100)" },
                        reasoning: { type: Type.STRING, description: "Short explanation of why this text was chosen." }
                    }
                }
            }
        });

        const jsonText = response.text || "{}";
        return JSON.parse(jsonText) as ExplanationAnalysis;
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
