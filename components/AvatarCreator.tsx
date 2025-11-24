
import React, { useState } from 'react';
import { AvatarProfile, VoiceOption } from '../types';
import { blobToBase64 } from '../utils/audioUtils';
import { createElevenLabsVoice } from '../services/elevenLabsService';
import { Loader2, Upload, CheckCircle2, UserCircle2, Mic2, FileText, Sparkles, BookOpen } from 'lucide-react';

interface Props {
  onProfileCreated: (profile: AvatarProfile) => void;
}

const AvatarCreator: React.FC<Props> = ({ onProfileCreated }) => {
  const [name, setName] = useState('');
  const [personality, setPersonality] = useState('');
  const [styleSamples, setStyleSamples] = useState('');
  const [memories, setMemories] = useState('');
  const [voice, setVoice] = useState<string>(VoiceOption.Kore);
  
  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // ElevenLabs State
  const [useElevenLabs, setUseElevenLabs] = useState(false);
  const [elevenApiKey, setElevenApiKey] = useState('');
  const [voiceSample, setVoiceSample] = useState<File | null>(null);
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleCreate = async () => {
    if (!imageFile || !name || !personality || !styleSamples || !memories) return;

    try {
      setIsGenerating(true);
      setStatusMessage('Processing image...');
      const imageBase64 = await blobToBase64(imageFile);

      let elevenLabsVoiceId = undefined;

      // Voice Cloning Flow
      if (useElevenLabs && elevenApiKey && voiceSample) {
        setStatusMessage('Cloning voice with ElevenLabs...');
        try {
           elevenLabsVoiceId = await createElevenLabsVoice(elevenApiKey, name, voiceSample);
        } catch (err: any) {
           throw new Error("Voice Cloning Failed: " + err.message);
        }
      }

      const newProfile: AvatarProfile = {
        id: Date.now().toString(),
        name,
        personality,
        styleSamples,
        memories,
        imageBase64,
        voiceName: voice,
        elevenLabsApiKey: useElevenLabs ? elevenApiKey : undefined,
        elevenLabsVoiceId: elevenLabsVoiceId,
      };

      onProfileCreated(newProfile);
    } catch (error) {
      console.error(error);
      alert('Failed to generate avatar. ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
      setStatusMessage('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-slate-800 rounded-xl shadow-xl border border-slate-700 overflow-y-auto max-h-full">
      <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
        <UserCircle2 className="text-purple-400" />
        Setup Persona Profile
      </h2>

      <div className="space-y-6">
        {/* Image Upload */}
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">1. Avatar Face</label>
            <div className="flex items-center gap-4">
                <div className={`relative w-32 h-32 rounded-full bg-slate-700 overflow-hidden border-2 border-dashed border-slate-500 flex items-center justify-center ${!imagePreview ? 'hover:border-purple-400 transition-colors' : ''}`}>
                    {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <Upload className="text-slate-400" />
                    )}
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
                <div className="text-xs text-slate-400 flex-1">
                    Upload a portrait. This image will represent the AI during the voice conversation.
                </div>
            </div>
        </div>

        {/* Basic Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                    placeholder="e.g. Cyber Sage"
                />
            </div>
            <div>
                 <label className="block text-sm font-medium text-slate-300 mb-1">
                    Default Voice (Gemini)
                    <span className="text-xs text-slate-500 ml-2">(Live Mode Only)</span>
                 </label>
                 <select 
                     value={voice} 
                     onChange={(e) => setVoice(e.target.value)}
                     className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                 >
                     {Object.values(VoiceOption).map(v => (
                         <option key={v} value={v}>{v}</option>
                     ))}
                 </select>
            </div>
        </div>

        {/* Advanced Inputs */}
        <div className="grid grid-cols-1 gap-4">
            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                   <Sparkles size={16} className="text-yellow-400"/>
                   Personality Traits
                </label>
                <textarea 
                    value={personality}
                    onChange={(e) => setPersonality(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white h-24 focus:ring-2 focus:ring-purple-500 outline-none resize-none text-sm font-mono"
                    placeholder={`- Warmth: High\n- Empathy: Very High\n- Humor: Low\n- Directness: Medium`}
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                   <BookOpen size={16} className="text-green-400"/>
                   Life Story & Memories
                </label>
                <p className="text-xs text-slate-500 mb-2">
                    Paste specific events, biography, or stories here. The AI will treat these as its own real memories.
                </p>
                <textarea 
                    value={memories}
                    onChange={(e) => setMemories(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white h-32 focus:ring-2 focus:ring-purple-500 outline-none resize-none text-sm"
                    placeholder="I was born in a small town... I remember the time I..."
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                   <FileText size={16} className="text-blue-400"/>
                   Speaking Style
                </label>
                <p className="text-xs text-slate-500 mb-2">Paste emails or texts to mimic the tone/sentence structure.</p>
                <textarea 
                    value={styleSamples}
                    onChange={(e) => setStyleSamples(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white h-24 focus:ring-2 focus:ring-purple-500 outline-none resize-none text-sm"
                    placeholder="Paste sample text here..."
                />
            </div>
        </div>

        {/* Voice Cloning Section */}
        <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-200 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={useElevenLabs}
                        onChange={(e) => setUseElevenLabs(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-purple-600 focus:ring-purple-500 bg-slate-800"
                    />
                    <span className="flex items-center gap-2">
                        <Mic2 size={16} className="text-indigo-400" />
                        Clone Custom Voice (ElevenLabs)
                    </span>
                </label>
                {useElevenLabs && (
                    <span className="text-[10px] text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded border border-indigo-500/20">
                        Chat Mode Only
                    </span>
                )}
            </div>

            {useElevenLabs && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1">ElevenLabs API Key</label>
                        <input 
                            type="password" 
                            value={elevenApiKey}
                            onChange={(e) => setElevenApiKey(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg p-2.5 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="sk_..."
                        />
                    </div>
                    <div>
                         <label className="block text-xs font-medium text-slate-400 mb-1">Voice Sample (Audio File)</label>
                         <input 
                            type="file" 
                            accept="audio/*"
                            onChange={(e) => setVoiceSample(e.target.files?.[0] || null)}
                            className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">Upload a clear 1-2 minute recording of the voice you want to clone.</p>
                    </div>
                </div>
            )}
        </div>

        <button
            onClick={handleCreate}
            disabled={isGenerating || !name || !imageFile || !personality || !styleSamples || !memories || (useElevenLabs && (!elevenApiKey || !voiceSample))}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {isGenerating ? (
                <>
                    <Loader2 className="animate-spin" />
                    {statusMessage || 'Creating Profile...'}
                </>
            ) : (
                <>
                    <CheckCircle2 size={20} />
                    Create & Start Talking
                </>
            )}
        </button>
      </div>
    </div>
  );
};

export default AvatarCreator;
