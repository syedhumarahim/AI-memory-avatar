
import React, { useState, useRef, useEffect } from 'react';
import { AvatarProfile, ExplanationAnalysis } from '../types';
import { generateAvatarResponse, generateSpeech, transcribeAudio, explainResponse } from '../services/geminiService';
import { generateElevenLabsSpeech } from '../services/elevenLabsService';
import { blobToBase64, decodeAudioData } from '../utils/audioUtils';
import { Mic, Send, StopCircle, Loader2, Sparkles, BrainCircuit, Activity, BookOpen, User, Calculator } from 'lucide-react';

interface Props {
  profile: AvatarProfile;
}

interface Message {
  role: string;
  text: string;
  explanation?: ExplanationAnalysis;
}

const AvatarChat: React.FC<Props> = ({ profile }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Explanation State
  const [explainingIndex, setExplainingIndex] = useState<number | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Initial welcome message
    if (messages.length === 0) {
      setMessages([{ role: 'model', text: `Hello, I am ready to speak.` }]);
    }
  }, [profile.name]);

  useEffect(() => {
    // Scroll to bottom on message change
    if (scrollRef.current) {
        scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, explainingIndex]);

  const playResponseAudio = async (text: string) => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }
      const ctx = audioContextRef.current;
      
      let audioBuffer: AudioBuffer;

      // 1. Check for ElevenLabs
      if (profile.elevenLabsVoiceId) {
          // Key is handled internally in service now
          const mp3Data = await generateElevenLabsSpeech(profile.elevenLabsVoiceId, text);
          audioBuffer = await ctx.decodeAudioData(mp3Data); // Standard decode for MP3
      } else {
          // 2. Fallback to Gemini
          const pcmData = await generateSpeech(text, profile.voiceName);
          audioBuffer = await decodeAudioData(new Uint8Array(pcmData), ctx);
      }
      
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      
      source.onended = () => {
        setIsPlayingAudio(false);
      };

      setIsPlayingAudio(true);
      source.start(0);
      audioSourceRef.current = source;

    } catch (e) {
      console.error("Audio playback error", e);
      setIsPlayingAudio(false);
      
      // Attempt fallback if ElevenLabs failed
      if (profile.elevenLabsVoiceId) {
          console.log("Falling back to Gemini TTS...");
          try {
             const pcmData = await generateSpeech(text, profile.voiceName);
             if (audioContextRef.current) {
                 const ctx = audioContextRef.current;
                 const audioBuffer = await decodeAudioData(new Uint8Array(pcmData), ctx);
                 const source = ctx.createBufferSource();
                 source.buffer = audioBuffer;
                 source.connect(ctx.destination);
                 source.onended = () => setIsPlayingAudio(false);
                 setIsPlayingAudio(true);
                 source.start(0);
                 audioSourceRef.current = source;
             }
          } catch (fallbackError) {
             console.error("Fallback failed", fallbackError);
          }
      }
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
      // 1. Get Text Response - passing full profile for the system prompt
      const responseText = await generateAvatarResponse(profile, textToProcess, messages);
      
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);

      // 2. Play Audio 
      await playResponseAudio(responseText);

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'error', text: "I'm having trouble thinking right now." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Explainability Logic ---
  const handleExplain = async (index: number) => {
      // If already open, close it
      if (explainingIndex === index) {
          setExplainingIndex(null);
          return;
      }

      const msg = messages[index];
      // If we already have the explanation, just open it
      if (msg.explanation) {
          setExplainingIndex(index);
          return;
      }

      // Generate explanation
      setExplainingIndex(index); // Open loading view
      const userMsg = messages[index - 1]?.text || "Context unavailable";
      
      try {
          const analysis = await explainResponse(profile, userMsg, msg.text);
          const updatedMessages = [...messages];
          updatedMessages[index].explanation = analysis;
          setMessages(updatedMessages);
      } catch (e) {
          console.error("Explanation failed", e);
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

  const renderExplanationBar = (label: string, score: number, colorClass: string, icon: React.ReactNode) => (
      <div className="mb-2">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span className="flex items-center gap-1">{icon} {label}</span>
              <span className="font-mono">{score.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div 
                  className={`h-full rounded-full transition-all duration-1000 ${colorClass}`} 
                  style={{ width: `${score}%` }}
              />
          </div>
      </div>
  );

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-2xl relative">
      
      {/* Header Area */}
      <div className="flex items-center gap-4 p-4 border-b border-slate-800 bg-slate-800/50">
        <div className="relative w-16 h-16 flex-shrink-0">
             <div className={`absolute inset-0 rounded-full border-2 overflow-hidden bg-black shadow-lg ${isPlayingAudio ? 'border-green-400 shadow-green-400/30' : 'border-slate-600'}`}>
                <img src={`data:image/png;base64,${profile.imageBase64}`} className="h-full w-full object-cover" alt="Avatar" />
             </div>
        </div>
        
        <div className="flex-1">
             <h3 className="text-xl font-bold text-white flex items-center gap-2">
                 {profile.name}
                 <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-xs border border-purple-500/30">AI Persona</span>
             </h3>
             <p className="text-sm text-slate-400 line-clamp-1">{profile.styleSamples.substring(0, 60)}...</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-slate-900/50 scroll-smooth">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-5 py-3 text-sm leading-relaxed relative group ${
              m.role === 'user' 
                ? 'bg-purple-600 text-white rounded-br-none shadow-md shadow-purple-900/20' 
                : m.role === 'error' ? 'bg-red-900/50 text-red-200'
                : 'bg-slate-700 text-slate-200 rounded-bl-none shadow-md'
            }`}>
              {m.text}

              {/* Explainability Button (Only for Model) */}
              {m.role === 'model' && (
                  <button 
                    onClick={() => handleExplain(idx)}
                    className="absolute -right-12 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-cyan-400 transition-colors opacity-0 group-hover:opacity-100"
                    title="Analyze Response Vectors"
                  >
                      <BrainCircuit size={20} />
                  </button>
              )}
            </div>

            {/* Explainability Dashboard */}
            {explainingIndex === idx && m.role === 'model' && (
                <div className="max-w-[85%] w-full mt-3 bg-slate-950/80 border border-cyan-900/50 rounded-lg p-4 animate-in fade-in slide-in-from-top-2 backdrop-blur-sm">
                    <div className="flex justify-between items-start mb-3">
                        <h4 className="text-xs font-bold text-cyan-400 flex items-center gap-2 uppercase tracking-wider">
                            <Activity size={14} /> Interpreting the Output
                        </h4>
                        <span className="text-[10px] text-slate-500 border border-slate-800 px-2 py-0.5 rounded bg-slate-900 flex items-center gap-1">
                            <Calculator size={10} />
                            Vector Embedding Scores
                        </span>
                    </div>
                    
                    {!m.explanation ? (
                         <div className="flex items-center gap-2 text-slate-500 text-xs h-16">
                            <Loader2 className="animate-spin text-cyan-500" size={14} />
                            Calculating Cosine Similarities...
                         </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                {renderExplanationBar('Personality Alignment', m.explanation.personalityScore, 'bg-yellow-500', <User size={12}/>)}
                                {renderExplanationBar('Memory Retrieval', m.explanation.memoriesScore, 'bg-green-500', <BookOpen size={12}/>)}
                                {renderExplanationBar('Style Match', m.explanation.styleScore, 'bg-blue-500', <Sparkles size={12}/>)}
                            </div>
                            <div className="bg-slate-900/50 rounded p-3 border border-slate-800">
                                <span className="text-xs text-slate-500 font-mono block mb-1">COGNITIVE TRACE:</span>
                                <p className="text-xs text-slate-300 italic">
                                    "{m.explanation.reasoning}"
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
          </div>
        ))}
        {isProcessing && (
            <div className="flex justify-start">
                 <div className="bg-slate-800/50 rounded-2xl px-4 py-3 flex items-center gap-2 text-slate-400 text-xs">
                     <Sparkles size={14} className="animate-spin text-purple-400"/>
                     <span>Thinking...</span>
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
