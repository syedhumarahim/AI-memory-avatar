export interface AvatarProfile {
  id: string;
  name: string;
  memory: string; // The text description/persona
  imageBase64: string; // The original image
  videoUrl?: string; // The Veo generated video loop
  voiceName: string; // The selected Gemini TTS voice (fallback)
  
  // ElevenLabs Configuration
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string; 
  
  // Legacy/Fallback Gemini Cloning
  voiceSampleBase64?: string; 
}

export enum AppView {
  CREATE = 'CREATE',
  CHAT = 'CHAT',
  LIVE = 'LIVE'
}

export enum VoiceOption {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

// Augment window for AI Studio key selection
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    webkitAudioContext: typeof AudioContext;
  }
}