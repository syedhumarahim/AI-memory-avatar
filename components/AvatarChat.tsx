import React, { useState, useRef, useEffect } from 'react';
import { AvatarProfile } from '../types';
import { generateAvatarResponse, generateSpeech, transcribeAudio } from '../services/geminiService';
import { generateElevenLabsSpeech } from '../services/elevenLabsService';
import { blobToBase64 } from '../utils/audioUtils';
import { Mic, Send, Volume2, StopCircle, Loader2, Sparkles, Zap } from 'lucide-react';

interface Props {
  profile: AvatarProfile;
}

const AvatarChat: React.FC<Props> = ({ profile }) => {
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Video Ref for controlling playback speed/looping
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Initial welcome message
    if (messages.length === 0) {
      setMessages([{ role: 'model', text: `Hello, I am ${profile.name}.` }]);
    }
  }, [profile.name]);

  useEffect(() => {
    // Scroll to bottom on message change
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Sync video playback to audio volume (Simulated Lip Sync)
  const syncLipMovement = () => {
    if (!analyserRef.current || !videoRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const average = sum / bufferLength;

    // Threshold for "talking"
    // Adjust playback rate or play/pause based on volume
    if (average > 10) { 
        // Talking
        if (videoRef.current.paused) {
            videoRef.current.play().catch(() => {});
        }
        // Speed up video slightly on louder sounds for expressiveness
        videoRef.current.playbackRate = 1.0 + (average / 255); 
    } else {
        // Silent / Pausing
        if (!videoRef.current.paused) {
             videoRef.current.pause();
        }
    }

    animationFrameRef.current = requestAnimationFrame(syncLipMovement);
  };

  const playResponseAudio = async (text: string) => {
    try {
      let audioData: ArrayBuffer;

      // 1. Try ElevenLabs
      if (profile.elevenLabsApiKey && profile.elevenLabsVoiceId) {
         try {
             audioData = await generateElevenLabsSpeech(profile.elevenLabsApiKey, profile.elevenLabsVoiceId, text);
         } catch (e) {
             console.error("ElevenLabs Failed, failing back to Gemini", e);
             audioData = await generateSpeech(text, profile.voiceName);
         }
      } else {
          // 2. Fallback to Gemini (with optional basic cloning if configured)
          audioData = await generateSpeech(text, profile.voiceName, profile.voiceSampleBase64);
      }
      
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      
      const audioBuffer = await ctx.decodeAudioData(audioData);
      
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Setup Analyzer for Lip Sync
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(analyser);
      analyser.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlayingAudio(false);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (videoRef.current) {
            videoRef.current.pause();
            videoRef.current.currentTime = 0; // Return to start/neutral frame
        }
      };

      setIsPlayingAudio(true);
      source.start(0);
      audioSourceRef.current = source;
      
      // Start Sync Loop
      syncLipMovement();

    } catch (e) {
      console.error("Audio playback error", e);
      setIsPlayingAudio(false);
    }
  };

  const handleSubmit = async (textOverride?: string) => {
    const textToProcess = textOverride || inputText;
    if (!textToProcess.trim() || isProcessing) return;

    // Add user message
    const newMessages = [...messages, { role: 'user', text: textToProcess }];
    setMessages(newMessages);
    setInputText('');
    setIsProcessing(true);

    try {
      // 1. Get Text Response
      const responseText = await generateAvatarResponse(profile.memory, textToProcess, messages);
      
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);

      // 2. Play Audio (which triggers video animation via sync)
      await playResponseAudio(responseText);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'error', text: "I'm having trouble thinking right now." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Audio Recording Logic ---
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' }); 
        setIsProcessing(true);
        try {
            const base64 = await blobToBase64(blob);
            const transcription = await transcribeAudio(base64);
            if (transcription) {
                handleSubmit(transcription);
            }
        } catch (e) {
            console.error("Transcription failed", e);
        } finally {
            setIsProcessing(false);
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (e) {
      console.error("Mic access denied", e);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative">
      
      {/* Header Area with Smaller Video */}
      <div className="flex items-center gap-4 p-4 border-b border-slate-800 bg-slate-800/50">
        <div className="relative w-20 h-20 md:w-24 md:h-24 flex-shrink-0">
             <div className="absolute inset-0 rounded-full border-2 border-slate-600 overflow-hidden bg-black shadow-lg">
                {profile.videoUrl ? (
                <video 
                    ref={videoRef}
                    src={profile.videoUrl} 
                    loop 
                    muted 
                    playsInline
                    className="h-full w-full object-cover transform scale-125" // Scale up slightly to focus on face/mouth
                />
                ) : (
                <img src={`data:image/png;base64,${profile.imageBase64}`} className="h-full w-full object-cover" alt="Avatar" />
                )}
             </div>
             {isPlayingAudio && (
                 <div className="absolute -bottom-1 -right-1 bg-green-500 rounded-full p-1 border-2 border-slate-800 animate-pulse">
                     <Volume2 size={12} className="text-white" />
                 </div>
             )}
        </div>
        
        <div className="flex-1">
             <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 {profile.name}
                 <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs border border-purple-500/30">AI Persona</span>
                 {profile.elevenLabsVoiceId ? (
                     <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30 flex items-center gap-1">
                        <Zap size={10} /> ElevenLabs Voice
                     </span>
                 ) : profile.voiceSampleBase64 ? (
                     <span className="px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-xs border border-blue-500/30 flex items-center gap-1">
                        <Sparkles size={10} /> Gemini Mimic
                     </span>
                 ) : null}
             </h3>
             <p className="text-sm text-slate-400 line-clamp-1">{profile.memory.substring(0, 60)}...</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50 scroll-smooth">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed ${
              m.role === 'user' 
                ? 'bg-purple-600 text-white rounded-br-none shadow-md shadow-purple-900/20' 
                : m.role === 'error' ? 'bg-red-900/50 text-red-200'
                : 'bg-slate-700 text-slate-200 rounded-bl-none shadow-md'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {isProcessing && (
            <div className="flex justify-start">
                 <div className="bg-slate-800/50 rounded-2xl px-4 py-3 flex items-center gap-2 text-slate-400 text-xs">
                     <Sparkles size={14} className="animate-spin text-purple-400"/>
                     <span>Thinking & Generating Speech...</span>
                 </div>
            </div>
        )}
        <div ref={scrollRef}></div>
      </div>

      {/* Input Area */}
      <div className="p-4 bg-slate-800 border-t border-slate-700 flex items-center gap-3">
        <button
          onClick={isRecording ? stopRecording : startRecording}
          className={`p-3 rounded-full transition-all ${
            isRecording ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
          }`}
          title={isRecording ? "Stop Recording" : "Voice Input"}
        >
          {isRecording ? <StopCircle size={20} /> : <Mic size={20} />}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder={isRecording ? "Listening..." : "Message " + profile.name + "..."}
          disabled={isRecording || isProcessing}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-full px-5 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
        />

        <button
          onClick={() => handleSubmit()}
          disabled={isProcessing || (!inputText.trim() && !isRecording)}
          className="p-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-purple-900/30"
        >
          {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
        </button>
      </div>
    </div>
  );
};

export default AvatarChat;
