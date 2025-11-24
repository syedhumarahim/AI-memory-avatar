
import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { AvatarProfile } from '../types';
import { createPcmBlob, decodeAudioData } from '../utils/audioUtils';
import { generateElevenLabsSpeech } from '../services/elevenLabsService';
import { MODELS, AUDIO_SAMPLE_RATE_INPUT, AUDIO_SAMPLE_RATE_OUTPUT } from '../constants';
import { buildSystemPrompt } from '../utils/promptUtils';
import { Mic, MicOff, PhoneOff, Radio, Zap } from 'lucide-react';

interface Props {
  profile: AvatarProfile;
  onEndSession: () => void;
}

const LiveSession: React.FC<Props> = ({ profile, onEndSession }) => {
  const [micActive, setMicActive] = useState(true);
  const [status, setStatus] = useState<string>('Initializing...');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volumeLevel, setVolumeLevel] = useState(0);

  // Audio Contexts & State
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Audio Scheduling
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Transcription Accumulator for ElevenLabs
  const currentTranscriptRef = useRef<string>('');

  // Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);

  const useCustomVoice = !!(profile.elevenLabsVoiceId);

  useEffect(() => {
    startSession();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }
    
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
        inputContextRef.current.close();
    }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
        outputContextRef.current.close();
    }
    
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
    }
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    
    stopAllAudio();
  };

  const stopAllAudio = () => {
     audioSourcesRef.current.forEach(source => {
         try { source.stop(); } catch(e) {}
     });
     audioSourcesRef.current.clear();
     setIsAiSpeaking(false);
     nextStartTimeRef.current = 0;
  };

  const startSession = async () => {
    try {
      setStatus('Connecting to Gemini Live...');
      
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      inputContextRef.current = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE_INPUT });
      outputContextRef.current = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE_OUTPUT });
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Build the new strict system prompt
      const systemInstruction = buildSystemPrompt(profile);

      sessionPromiseRef.current = ai.live.connect({
        model: MODELS.LIVE,
        config: {
            systemInstruction: systemInstruction,
            responseModalities: [Modality.AUDIO],
            // Enable output transcription to get text for ElevenLabs
            outputAudioTranscription: {}, 
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: profile.voiceName || 'Kore' }}
            }
        },
        callbacks: {
            onopen: async () => {
                setStatus('Connected');
                await startMicrophone();
            },
            onmessage: handleMessage,
            onclose: () => {
                setStatus('Disconnected');
                console.log('Session closed');
            },
            onerror: (e) => {
                console.error('Session error', e);
                setError('Connection error');
                setStatus('Error');
            }
        }
      });

    } catch (e: any) {
      console.error(e);
      setError(e.message || "Failed to start session");
      setStatus('Error');
    }
  };

  const startMicrophone = async () => {
     if (!inputContextRef.current) return;
     
     try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         streamRef.current = stream;
         
         const ctx = inputContextRef.current;
         const source = ctx.createMediaStreamSource(stream);
         const processor = ctx.createScriptProcessor(4096, 1, 1);
         
         processor.onaudioprocess = (e) => {
             if (!micActive) return;
             
             const inputData = e.inputBuffer.getChannelData(0);
             updateVolumeVisualizer(inputData);

             const pcmBlob = createPcmBlob(inputData);
             if (sessionPromiseRef.current) {
                 sessionPromiseRef.current.then(session => {
                     session.sendRealtimeInput({ media: pcmBlob });
                 });
             }
         };

         source.connect(processor);
         processor.connect(ctx.destination);
         
         sourceNodeRef.current = source;
         processorRef.current = processor;
         
     } catch (e) {
         console.error("Mic Error", e);
         setError("Microphone access denied");
     }
  };

  const handleMessage = async (message: LiveServerMessage) => {
      // Handle Interruption
      if (message.serverContent?.interrupted) {
          console.log("Interrupted!");
          stopAllAudio();
          currentTranscriptRef.current = ''; 
          return;
      }

      // --- Path A: Custom ElevenLabs Voice ---
      if (useCustomVoice) {
          // 1. Accumulate Text
          if (message.serverContent?.outputTranscription?.text) {
              currentTranscriptRef.current += message.serverContent.outputTranscription.text;
          }

          // 2. On Turn Complete -> Generate & Play
          if (message.serverContent?.turnComplete) {
              const textToSpeak = currentTranscriptRef.current;
              currentTranscriptRef.current = ''; // Reset for next turn

              if (textToSpeak.trim() && profile.elevenLabsVoiceId) {
                  try {
                      // Stop any previous lingering audio just in case
                      stopAllAudio();
                      setIsAiSpeaking(true);
                      
                      // Key handled internally in service
                      const audioData = await generateElevenLabsSpeech(profile.elevenLabsVoiceId, textToSpeak);
                      
                      if (outputContextRef.current) {
                          const ctx = outputContextRef.current;
                          // Standard browser decode for MP3/WAV
                          const audioBuffer = await ctx.decodeAudioData(audioData);
                          
                          const source = ctx.createBufferSource();
                          source.buffer = audioBuffer;
                          source.connect(ctx.destination);
                          
                          source.onended = () => {
                              audioSourcesRef.current.delete(source);
                              setIsAiSpeaking(false);
                          };

                          source.start(0);
                          audioSourcesRef.current.add(source);
                      }
                  } catch (err) {
                      console.error("ElevenLabs Playback Error:", err);
                      setIsAiSpeaking(false);
                  }
              }
          }
          // Return early to ignore Native Audio bytes
          return;
      }

      // --- Path B: Native Gemini Audio (Low Latency) ---
      const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
      if (base64Audio && outputContextRef.current) {
          const ctx = outputContextRef.current;
          
          try {
             const rawBytes = atob(base64Audio);
             const len = rawBytes.length;
             const bytes = new Uint8Array(len);
             for(let i=0; i<len; i++) bytes[i] = rawBytes.charCodeAt(i);
             
             const audioBuffer = await decodeAudioData(bytes, ctx, AUDIO_SAMPLE_RATE_OUTPUT);
             
             nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
             
             const source = ctx.createBufferSource();
             source.buffer = audioBuffer;
             source.connect(ctx.destination);
             
             source.onended = () => {
                 audioSourcesRef.current.delete(source);
                 if (audioSourcesRef.current.size === 0) {
                     setIsAiSpeaking(false);
                 }
             };

             source.start(nextStartTimeRef.current);
             nextStartTimeRef.current += audioBuffer.duration;
             
             audioSourcesRef.current.add(source);
             setIsAiSpeaking(true);

          } catch (e) {
              console.error("Audio Decode Error", e);
          }
      }
  };

  const updateVolumeVisualizer = (data: Float32Array) => {
      let sum = 0;
      for (let i = 0; i < data.length; i += 50) {
          sum += Math.abs(data[i]);
      }
      const avg = sum / (data.length / 50);
      setVolumeLevel(prev => prev * 0.8 + avg * 20); 
  };

  const toggleMic = () => {
      setMicActive(!micActive);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 rounded-xl overflow-hidden relative shadow-2xl border border-slate-800">
      
      {/* Visualizer Area */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        
        {/* Connection Status Indicator */}
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/50 border border-slate-700 backdrop-blur-sm">
            <div className={`w-2 h-2 rounded-full ${status === 'Connected' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">{status}</span>
        </div>

        {/* Main Avatar */}
        <div className="relative group">
            {/* Ripples */}
            {isAiSpeaking && (
                <>
                    <div className="absolute inset-0 rounded-full border border-purple-500/50 opacity-0 animate-[ping_2s_linear_infinite]" />
                    <div className="absolute inset-0 rounded-full border border-indigo-500/50 opacity-0 animate-[ping_2s_linear_infinite_0.5s]" />
                    <div className="absolute -inset-4 rounded-full bg-purple-500/10 blur-xl animate-pulse" />
                </>
            )}

            <div className={`relative z-10 w-48 h-48 md:w-72 md:h-72 rounded-full p-1.5 transition-all duration-300 ${isAiSpeaking ? 'scale-105' : 'scale-100'}`}>
                <div className={`absolute inset-0 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 animate-spin-slow opacity-0 ${isAiSpeaking ? 'opacity-100' : ''}`} />
                <div className="absolute inset-[3px] rounded-full bg-slate-950 z-10" />
                
                <div className={`relative z-20 w-full h-full rounded-full overflow-hidden border-4 transition-colors duration-300 ${isAiSpeaking ? 'border-transparent' : 'border-slate-800'}`}>
                    <img 
                        src={`data:image/png;base64,${profile.imageBase64}`} 
                        className="h-full w-full object-cover" 
                        alt="Avatar" 
                    />
                </div>
            </div>
        </div>

        {/* Live Audio Visualizer Bar */}
        <div className="mt-12 h-16 flex items-center justify-center gap-1.5 w-64">
            {isAiSpeaking ? (
                // AI Speaking Animation
                Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="w-2 bg-purple-500 rounded-full animate-[bounce_1s_infinite]" style={{ animationDelay: `${i * 0.1}s`, height: '30%' }}></div>
                ))
            ) : (
                // User Mic Visualizer
                micActive ? (
                    <>
                        <div className="w-2 bg-green-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(10, Math.min(100, volumeLevel * 300))}%` }}></div>
                        <div className="w-2 bg-green-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(10, Math.min(100, volumeLevel * 400))}%` }}></div>
                        <div className="w-2 bg-green-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(10, Math.min(100, volumeLevel * 200))}%` }}></div>
                    </>
                ) : (
                    <div className="text-slate-600 text-sm font-medium tracking-widest uppercase">Mic Muted</div>
                )
            )}
        </div>

        {error && (
            <div className="mt-4 px-4 py-2 bg-red-900/50 border border-red-500/30 rounded-lg text-red-200 text-sm flex items-center gap-2">
                <Radio size={16} />
                {error}
            </div>
        )}
      </div>

      {/* Control Bar */}
      <div className="bg-slate-900/80 backdrop-blur-md border-t border-slate-800 p-6 flex justify-center items-center gap-8 relative z-30">
        <button 
            onClick={toggleMic}
            className={`p-5 rounded-full transition-all duration-200 transform hover:scale-110 ${
                micActive 
                ? 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-600 shadow-lg' 
                : 'bg-red-500 text-white hover:bg-red-600 shadow-red-500/30 shadow-lg border border-red-400'
            }`}
        >
            {micActive ? <Mic size={28} /> : <MicOff size={28} />}
        </button>

        <button 
            onClick={onEndSession}
            className="p-6 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all duration-200 transform hover:scale-110 shadow-xl shadow-red-900/40 border-4 border-slate-900"
            title="End Call"
        >
            <PhoneOff size={32} />
        </button>

        <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden md:flex items-center gap-3 text-slate-500">
             <Zap size={16} className={status === 'Connected' ? 'text-yellow-500' : ''} />
             <span className="text-xs font-mono">
                 {useCustomVoice ? 'ELEVENLABS + GEMINI LIVE' : 'GEMINI 2.5 LIVE'}
             </span>
        </div>
      </div>
    </div>
  );
};

export default LiveSession;
