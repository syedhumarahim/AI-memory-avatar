
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { MODELS } from "../constants";
import { VoiceOption } from "../types";

// Helper to get client (requires API key in env or selected via UI)
const getAiClient = () => {
  // In a real deployed app using Veo/Live, we rely on the injected key or process.env
  // For this demo, we assume process.env.API_KEY is available or injected.
  // When using Veo, we re-instantiate after key selection.
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Retry logic helper
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 2000
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isRetryable = 
      error.status === 503 || 
      error.code === 503 || 
      error.status === 429 || 
      error.code === 429 ||
      (error.message && (
        error.message.includes('503') || 
        error.message.includes('429') ||
        error.message.includes('overloaded') || 
        error.message.includes('quota') ||
        error.message.includes('RESOURCE_EXHAUSTED') ||
        error.message.includes('UNAVAILABLE')
      ));

    if (isRetryable && retries > 0) {
      console.warn(`Gemini API Error (429/503). Retrying in ${delay}ms... (${retries} retries left)`);
      await wait(delay);
      return retryWithBackoff(operation, retries - 1, delay * 2);
    }
    throw error;
  }
}

// 1. Text Generation with Memory
export const generateAvatarResponse = async (
  memory: string,
  userPrompt: string,
  history: { role: string; text: string }[]
) => {
  return retryWithBackoff(async () => {
    const ai = getAiClient();
    const systemInstruction = `You are a persona defined by the following memory:\n"${memory}"\n\nAnswer the user's questions acting as this persona. Keep answers concise and conversational (under 50 words usually). You must strictly communicate in English.`;
    
    // Construct chat history
    const chat = ai.chats.create({
      model: MODELS.TEXT,
      config: { systemInstruction },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }]
      }))
    });

    const result = await chat.sendMessage({ message: userPrompt });
    return result.text || "";
  });
};

// 2. TTS Generation / Voice Cloning
export const generateSpeech = async (text: string, voiceName: string, referenceAudioBase64?: string): Promise<ArrayBuffer> => {
  return retryWithBackoff(async () => {
    const ai = getAiClient();
    
    // STRATEGY A: Voice Cloning via Multimodal Context
    // If we have a reference audio, we use the Native Audio model to "mimic" the speech.
    if (referenceAudioBase64) {
      try {
        const response = await ai.models.generateContent({
          model: MODELS.LIVE, // gemini-2.5-flash-native-audio-preview-09-2025
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: 'audio/wav', // Assuming WAV/WebM from browser recording/upload
                  data: referenceAudioBase64
                }
              },
              {
                text: `Please read the following text aloud. Mimic the voice, tone, and pacing of the attached audio sample as closely as possible.\n\nText to speak: "${text}"`
              }
            ]
          },
          config: {
            responseModalities: [Modality.AUDIO],
          }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
           return parseBase64ToBuffer(base64Audio);
        }
        // If cloning yields no audio (safety/refusal), fall through to standard TTS
        console.warn("Cloning produced no audio, falling back to standard TTS.");
      } catch (e) {
        console.warn("Cloning failed, falling back to standard TTS", e);
      }
    }

    // STRATEGY B: Standard TTS (Fallback or Default)
    const response = await ai.models.generateContent({
      model: MODELS.TTS,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");

    return parseBase64ToBuffer(base64Audio);
  });
};

// Helper for Audio Buffer Parsing
const parseBase64ToBuffer = (base64: string): ArrayBuffer => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

// 3. Audio Transcription
export const transcribeAudio = async (audioBase64: string, mimeType: string = 'audio/webm'): Promise<string> => {
  return retryWithBackoff(async () => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model: MODELS.TRANSCRIPTION,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType, 
              data: audioBase64
            }
          },
          { text: "Transcribe exactly what is said in this audio." }
        ]
      }
    });
    return response.text || "";
  });
};

// 4. Voice Matching Analysis (Still useful for picking the fallback voice)
export const matchVoiceFromAudio = async (audioBase64: string): Promise<{ matchedVoice: string; reasoning: string }> => {
  return retryWithBackoff(async () => {
    const ai = getAiClient();
    
    const response = await ai.models.generateContent({
      model: MODELS.TEXT,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/mp3',
              data: audioBase64
            }
          },
          { 
            text: `You are an expert audio engineer. Listen to this voice sample carefully. 
            Analyze the following characteristics:
            1. Gender (Male/Female/Androgynous)
            2. Pitch (High/Medium/Low)
            3. Timbre (Breathiness, roughness, resonance)
            4. Pacing (Fast/Slow)
            
            Your goal is to select the BEST MATCH from the following Google TTS voices. 
            
            Choose ONLY from this list:
            - Puck: Male, Tenor, Energetic, Youthful.
            - Charon: Male, Bass, Deep, Authoritative.
            - Kore: Female, Alto, Calm, Soothing.
            - Fenrir: Male, Baritone, Rough, Strong.
            - Zephyr: Female, Soprano, Bright, Cheerful.

            Return a JSON object with:
            - "voiceName": The exact name from the list.
            - "reasoning": A brief explanation.
            ` 
          }
        ]
      },
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) return { matchedVoice: 'Kore', reasoning: 'Analysis failed, defaulting.' };

    try {
      const json = JSON.parse(text);
      return {
        matchedVoice: json.voiceName || 'Kore',
        reasoning: json.reasoning || 'Matched based on audio characteristics.'
      };
    } catch (e) {
      return { matchedVoice: 'Kore', reasoning: 'Parsing failed, defaulting.' };
    }
  });
};

// 5. Veo Video Generation (Animation)
export const generateVeoAvatar = async (imageBase64: string, prompt: string): Promise<string> => {
  const ai = getAiClient(); 
  
  let operation = await retryWithBackoff(async () => {
    return await ai.models.generateVideos({
      model: MODELS.VEO_FAST,
      prompt: prompt,
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/png',
      },
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16'
      }
    });
  });

  while (!operation.done) {
    await wait(5000); 
    operation = await retryWithBackoff(async () => {
      return await ai.operations.getVideosOperation({ operation: operation });
    });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed");

  const videoRes = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await videoRes.blob();
  return URL.createObjectURL(blob);
};
