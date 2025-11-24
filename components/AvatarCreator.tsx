import React, { useState, useRef } from 'react';
import { AvatarProfile, VoiceOption } from '../types';
import { blobToBase64 } from '../utils/audioUtils';
import { generateVeoAvatar, matchVoiceFromAudio, generateSpeech } from '../services/geminiService';
import { createElevenLabsVoice, generateElevenLabsSpeech } from '../services/elevenLabsService';
import { Loader2, Upload, Video, Sparkles, Mic, CheckCircle2, Play, Wand2 } from 'lucide-react';

interface Props {
  onProfileCreated: (profile: AvatarProfile) => void;
}

const AvatarCreator: React.FC<Props> = ({ onProfileCreated }) => {
  const [name, setName] = useState('');
  const [memory, setMemory] = useState('');
  const [voice, setVoice] = useState<string>(VoiceOption.Kore);
  
  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  
  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  
  // Voice Cloning State
  // We strictly use the env variable now as requested
  const elevenLabsKey = process.env.ELEVEN_LABS_API_KEY || ""; 
  
  const [voiceInputType, setVoiceInputType] = useState<'mic' | 'upload'>('upload');
  const [isAnalyzingVoice, setIsAnalyzingVoice] = useState(false);
  const [voiceAnalysisResult, setVoiceAnalysisResult] = useState<string>('');
  
  // Cloning Results
  const [clonedVoiceId, setClonedVoiceId] = useState<string | null>(null);
  const [voiceSampleBlob, setVoiceSampleBlob] = useState<Blob | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);

  // Recorder Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const url = URL.createObjectURL(file);
      setImagePreview(url);
    }
  };

  const handleVoiceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      await processVoiceSample(file);
    }
  };

  const processVoiceSample = async (audioBlob: Blob) => {
    setIsAnalyzingVoice(true);
    setVoiceSampleBlob(audioBlob);
    setVoiceAnalysisResult('Processing audio...');

    try {
      const base64 = await blobToBase64(audioBlob);
      
      // 1. Voice Matching (Gemini) for fallback selection
      setVoiceAnalysisResult('Analyzing tone for fallback...');
      const { matchedVoice } = await matchVoiceFromAudio(base64);
      setVoice(matchedVoice);

      // 2. ElevenLabs Cloning (if key available in backend/env)
      if (elevenLabsKey && elevenLabsKey.length > 5) {
         setVoiceAnalysisResult('Cloning voice with ElevenLabs...');
         try {
            const tempName = name || "User Persona Voice";
            const vId = await createElevenLabsVoice(elevenLabsKey, tempName, audioBlob);
            setClonedVoiceId(vId);
            setVoiceAnalysisResult(`Voice successfully cloned! ID: ${vId.substring(0,6)}...`);
         } catch (elError: any) {
             console.error(elError);
             setVoiceAnalysisResult(`Cloning failed: ${elError.message}. Using fallback.`);
             setClonedVoiceId(null);
         }
      } else {
         setVoiceAnalysisResult(`Audio processed. Using Gemini fallback voice.`);
      }
      
    } catch (e) {
      console.error(e);
      setVoiceAnalysisResult('Analysis failed. We will use the standard voice selected above.');
    } finally {
      setIsAnalyzingVoice(false);
    }
  };

  const playVoicePreview = async () => {
    if (isPlayingPreview) return;
    setIsPlayingPreview(true);
    try {
        const text = `Hello! This is a preview of the voice for ${name || 'your avatar'}.`;
        let audioBuffer: ArrayBuffer;

        if (clonedVoiceId && elevenLabsKey) {
            audioBuffer = await generateElevenLabsSpeech(elevenLabsKey, clonedVoiceId, text);
        } else {
            // Fallback preview
            audioBuffer = await generateSpeech(text, voice);
        }

        const blob = new Blob([audioBuffer], { type: 'audio/wav' }); 
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => {
            setIsPlayingPreview(false);
            URL.revokeObjectURL(url);
        };
        await audio.play();
    } catch (e) {
        console.error("Preview failed", e);
        setIsPlayingPreview(false);
        alert("Could not play voice preview.");
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' }); 
        await processVoiceSample(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setVoiceAnalysisResult('Recording...');
    } catch (e) {
      console.error("Mic error", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCreate = async () => {
    if (!imageFile || !name || !memory) return;

    try {
      setIsGenerating(true);
      
      // 1. Check API Key for Veo
      if (window.aistudio) {
         try {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                setGenerationStep('Waiting for billing selection...');
                await window.aistudio.openSelectKey();
            }
         } catch (e) {
             console.warn("AI Studio key check failed", e);
         }
      }

      setGenerationStep('Processing image...');
      const imageBase64 = await blobToBase64(imageFile);

      setGenerationStep('Animating Avatar with Veo (this takes ~30-60s)...');
      
      const videoUrl = await generateVeoAvatar(
        imageBase64, 
        `A close-up video portrait of ${name} speaking. The subject's mouth is moving continuously as if having a conversation. Natural eye contact, blinking, slight head movement. High resolution, realistic lighting.`
      );

      setGenerationStep('Finalizing...');
      
      const newProfile: AvatarProfile = {
        id: Date.now().toString(),
        name,
        memory,
        imageBase64,
        videoUrl,
        voiceName: voice,
        elevenLabsApiKey: elevenLabsKey || undefined,
        elevenLabsVoiceId: clonedVoiceId || undefined,
        // Keep base64 sample just in case we need it for live API later
        voiceSampleBase64: voiceSampleBlob ? await blobToBase64(voiceSampleBlob) : undefined
      };

      onProfileCreated(newProfile);
    } catch (error) {
      console.error(error);
      alert('Failed to generate avatar. ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setIsGenerating(false);
      setGenerationStep('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 bg-slate-800 rounded-xl shadow-xl border border-slate-700">
      <h2 className="text-2xl font-bold mb-6 text-white flex items-center gap-2">
        <Sparkles className="text-purple-400" />
        Create AI Persona
      </h2>

      <div className="space-y-6">
        {/* Image Upload */}
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">1. Avatar Image</label>
            <div className="flex items-center gap-4">
                <div className={`relative w-32 h-32 rounded-lg bg-slate-700 overflow-hidden border-2 border-dashed border-slate-500 flex items-center justify-center ${!imagePreview ? 'hover:border-purple-400 transition-colors' : ''}`}>
                    {imagePreview ? (
                        <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                        <Upload className="text-slate-400" />
                    )}
                    <input type="file" accept="image/*" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                </div>
                <div className="text-xs text-slate-400 flex-1">
                    Upload a clear portrait. We will use <strong>Veo</strong> to animate this image into a talking video loop.
                </div>
            </div>
        </div>

        {/* Details */}
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
                 <label className="block text-sm font-medium text-slate-300 mb-1">Fallback Voice</label>
                 <div className="flex gap-2">
                    <select 
                        value={voice} 
                        onChange={(e) => setVoice(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-3 text-white focus:ring-2 focus:ring-purple-500 outline-none"
                    >
                        {Object.values(VoiceOption).map(v => (
                            <option key={v} value={v}>{v}</option>
                        ))}
                    </select>
                 </div>
            </div>
        </div>

        {/* Voice Cloning Section */}
        <div className="p-5 bg-gradient-to-br from-indigo-900/30 to-purple-900/30 rounded-xl border border-indigo-500/30 relative overflow-hidden">
             <div className="flex justify-between items-center mb-3">
                 <label className="block text-sm font-bold text-indigo-300 flex items-center gap-2">
                    <Wand2 size={16} />
                    2. Voice Cloning (ElevenLabs)
                 </label>
             </div>

             <div className="space-y-4">
                <div className="flex items-center justify-between">
                     <p className="text-xs text-slate-400">
                         Upload a 30s-60s recording for best results.
                     </p>
                     <div className="flex bg-slate-800 rounded-lg p-1">
                        <button 
                            onClick={() => setVoiceInputType('upload')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${voiceInputType === 'upload' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Upload
                        </button>
                        <button 
                            onClick={() => setVoiceInputType('mic')}
                            className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${voiceInputType === 'mic' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'}`}
                        >
                            Mic
                        </button>
                     </div>
                 </div>
                 
                 {voiceInputType === 'upload' ? (
                     <div className="flex items-center gap-3">
                         <div className="relative flex-1">
                             <input 
                                type="file" 
                                accept="audio/*"
                                onChange={handleVoiceFileUpload}
                                className="w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-slate-700 file:text-purple-400 hover:file:bg-slate-600 cursor-pointer"
                             />
                         </div>
                         {isAnalyzingVoice && <Loader2 className="animate-spin text-purple-400" size={20} />}
                     </div>
                 ) : (
                     <div className="flex items-center gap-3">
                         <button 
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors w-full justify-center ${isRecording ? 'bg-red-500/20 text-red-400 border border-red-500 animate-pulse' : 'bg-slate-800 text-slate-300 border border-slate-600 hover:bg-slate-700'}`}
                         >
                             {isRecording ? <div className="h-3 w-3 bg-red-500 rounded-full"/> : <Mic size={16} />}
                             {isRecording ? 'Recording... (Click to Stop)' : 'Record Voice Sample'}
                         </button>
                     </div>
                 )}
                 
                 {/* Analysis/Success Result */}
                 {voiceAnalysisResult && (
                    <div className={`mt-3 p-3 rounded-lg border text-xs flex gap-2 items-start ${isAnalyzingVoice ? 'bg-indigo-900/20 border-indigo-500/30 text-indigo-200' : 'bg-green-900/20 border-green-500/30 text-green-200'}`}>
                        {isAnalyzingVoice ? <Loader2 size={14} className="animate-spin mt-0.5" /> : <CheckCircle2 size={14} className="mt-0.5" />}
                        <div className="flex-1 flex justify-between items-center">
                            <div>
                                <span className="font-semibold block mb-1">Status:</span>
                                {voiceAnalysisResult}
                            </div>
                            {!isAnalyzingVoice && (clonedVoiceId || voiceSampleBlob) && (
                                <button 
                                    onClick={playVoicePreview}
                                    disabled={isPlayingPreview}
                                    className="p-2 bg-slate-700 rounded-full hover:bg-slate-600 text-purple-300 transition-colors"
                                    title="Play Preview"
                                >
                                    {isPlayingPreview ? <Loader2 size={16} className="animate-spin"/> : <Play size={16} />}
                                </button>
                            )}
                        </div>
                    </div>
                 )}
             </div>
        </div>

        {/* Memory */}
        <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Memory / Persona Description</label>
            <textarea 
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-white h-32 focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                placeholder="Describe who this person is, their history, personality, and how they should speak..."
            />
        </div>

        <button
            onClick={handleCreate}
            disabled={isGenerating || !name || !imageFile || !memory}
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-purple-900/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
            {isGenerating ? (
                <>
                    <Loader2 className="animate-spin" />
                    {generationStep}
                </>
            ) : (
                <>
                    <Video size={20} />
                    Generate Living Avatar
                </>
            )}
        </button>
      </div>
    </div>
  );
};

export default AvatarCreator;