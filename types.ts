
export interface AvatarProfile {
  id: string;
  name: string;
  personality: string; // Traits like "Warmth: High", "Humor: Low"
  styleSamples: string; // The source text/writings to mimic
  memories: string; // Specific biography and events to remember
  imageBase64: string; 
  voiceName: string; 
  elevenLabsVoiceId?: string; 
}

export interface ExplanationAnalysis {
  personalityScore: number;
  memoriesScore: number;
  styleScore: number;
  reasoning: string;
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
