
import React, { useEffect, useRef, useState } from 'react';
import { AvatarProfile } from '../types';
import { blobToBase64 } from '../utils/audioUtils';
import { generateAvatarResponse, transcribeAudio, generateSpeech } from '../services/geminiService';
import { generateElevenLabsSpeech } from '../services/elevenLabsService';
import { Mic, MicOff, PhoneOff, Volume2, Activity, AlertCircle } from 'lucide-react';

interface Props {
  profile: AvatarProfile;
  onEndSession: () => void;
}

const LiveSession: React.FC<Props> = ({ profile, onEndSession }) => {
  const [micActive, setMicActive] = useState(true);
  const [status, setStatus] = useState<string>('Initializing...');
  const [isTalking, setIsTalking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<{ role: string; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  
  // Recording & VAD
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // VAD State
  const lastSpeechTimeRef = useRef<number>(Date.now());
  const isUserSpeakingRef = useRef<boolean>(false);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Playback
  const analyserRef = useRef<AnalyserNode | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Constants
  const VAD_THRESHOLD = 0.02; // Adjust for sensitivity
  const SILENCE_DURATION = 2000; // Increased to 2s to reduce rate limits (429)

  useEffect(() => {
    startSession();
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cleanup = () => {
    stopRecording();
    if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (inputContextRef.current && inputContextRef.current.state !== 'closed') {
        inputContextRef.current.close();
    }
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
        outputContextRef.current.close();
    }
    if (processorRef.current) processorRef.current.disconnect();
    if (sourceNodeRef.current) sourceNodeRef.current.disconnect();
    if (currentSourceRef.current) currentSourceRef.current.stop();
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  };

  const startSession = async () => {
    try {
      setStatus('Accessing microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      inputContextRef.current = new AudioContextClass();
      outputContextRef.current = new AudioContextClass();

      // Setup Playback Analyser (Lip Sync)
      analyserRef.current = outputContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      syncLipMovement();

      // Setup VAD & Recording
      setupVAD(stream);
      startRecordingChunk();

      setStatus('Listening...');
    } catch (e) {
      console.error(e);
      setError("Could not access microphone.");
      setStatus('Error');
    }
  };

  // --- RECORDING & VAD LOGIC ---

  const setupVAD = (stream: MediaStream) => {
    if (!inputContextRef.current) return;
    const ctx = inputContextRef.current;
    
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    
    source.connect(processor);
    processor.connect(ctx.destination);
    
    sourceNodeRef.current = source;
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!micActive || isProcessing) return;

      const input = e.inputBuffer.getChannelData(0);
      let sum = 0;
      for (let i = 0; i < input.length; i++) {
        sum += input[i] * input[i];
      }
      const rms = Math.sqrt(sum / input.length);

      if (rms > VAD_THRESHOLD) {
        // User is speaking
        if (!isUserSpeakingRef.current) {
            // User just started speaking: Barge-in!
            stopAudioPlayback(); 
            // console.log("Speech detected");
        }
        isUserSpeakingRef.current = true;
        lastSpeechTimeRef.current = Date.now();
        
        // Clear existing silence timer
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
        }
      } else {
        // Silence
        if (isUserSpeakingRef.current) {
            // check how long we've been silent
            const timeSinceSpeech = Date.now() - lastSpeechTimeRef.current;
            
            if (timeSinceSpeech > SILENCE_DURATION && !silenceTimerRef.current) {
                 // Trigger processing after silence duration
                 silenceTimerRef.current = setTimeout(() => {
                     processUserSpeech();
                 }, 100); 
            }
        }
      }
    };
  };

  const startRecordingChunk = () => {
      if (!streamRef.current) return;
      try {
        const recorder = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = recorder;
        audioChunksRef.current = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.start();
      } catch (e) {
          console.error("Recorder start failed", e);
      }
  };

  const stopRecording = () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
      }
  };

  // --- PROCESSING PIPELINE ---

  const processUserSpeech = async () => {
      if (!mediaRecorderRef.current || isProcessing) return;
      
      // Reset VAD flags immediately
      isUserSpeakingRef.current = false;
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      // Stop current recorder to get the blob
      mediaRecorderRef.current.requestData();
      mediaRecorderRef.current.stop();
      
      setIsProcessing(true);
      setStatus('Thinking...');

      // Wait a tick for dataavailable to fire
      await new Promise(r => setTimeout(r, 100));

      // 50KB minimum to avoid processing silence/noise (Fixes 429 by reducing calls)
      const MIN_BLOB_SIZE = 10000; 
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Start recording next chunk immediately to avoid cutting off start of next sentence
      startRecordingChunk();

      if (blob.size < MIN_BLOB_SIZE) {
          setIsProcessing(false);
          setStatus('Listening...');
          return;
      }

      try {
          const base64Audio = await blobToBase64(blob);
          
          // 1. Transcribe (Gemini 2.5 Flash)
          // Explicitly pass mimeType for webm to ensure accurate transcription
          const transcription = await transcribeAudio(base64Audio, 'audio/webm');
          
          if (!transcription || transcription.trim().length < 2) {
              console.log("Empty transcription, ignoring");
              setIsProcessing(false);
              setStatus('Listening...');
              return;
          }
          console.log("User said:", transcription);

          // 2. Generate Response (Gemini 2.5 Flash Text Model)
          const newHistory = [...history, { role: 'user', text: transcription }];
          setHistory(newHistory);
          
          const responseText = await generateAvatarResponse(profile.memory, transcription, history);
          console.log("AI Response:", responseText);
          
          setHistory(prev => [...prev, { role: 'model', text: responseText }]);
          setStatus('Speaking...');

          // 3. Generate Audio (ElevenLabs or Fallback) & Play
          await playResponse(responseText);

      } catch (e: any) {
          console.error("Pipeline Error", e);
          if (e.message?.includes("429") || e.status === 429) {
              setStatus("Rate limited. Waiting...");
              await new Promise(r => setTimeout(r, 3000));
          } else {
              setStatus("Error processing speech.");
          }
      } finally {
          setIsProcessing(false);
          if (micActive) setStatus('Listening...');
      }
  };

  // --- AUDIO OUTPUT & LIP SYNC ---

  const playResponse = async (text: string) => {
      if (!outputContextRef.current) return;
      
      try {
          let audioBuffer: AudioBuffer | null = null;

          // Attempt ElevenLabs if configured (User Preference)
          if (profile.elevenLabsApiKey && profile.elevenLabsVoiceId) {
             try {
                const arrayBuffer = await generateElevenLabsSpeech(profile.elevenLabsApiKey, profile.elevenLabsVoiceId, text);
                audioBuffer = await outputContextRef.current.decodeAudioData(arrayBuffer);
             } catch (e) {
                 console.warn("ElevenLabs failed, using fallback", e);
             }
          } 
          
          // Fallback to Gemini TTS if ElevenLabs failed or not configured
          if (!audioBuffer) {
             const bufferData = await generateSpeech(text, profile.voiceName);
             audioBuffer = await outputContextRef.current.decodeAudioData(bufferData);
          }

          if (audioBuffer) {
              playAudioBuffer(audioBuffer);
          }
      } catch (e) {
          console.error("Audio generation failed", e);
          setStatus('Audio Error');
      }
  };

  const playAudioBuffer = (buffer: AudioBuffer) => {
      if (!outputContextRef.current) return;
      const ctx = outputContextRef.current;
      
      stopAudioPlayback(); // Ensure no overlap

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      
      if (analyserRef.current) {
          source.connect(analyserRef.current);
          analyserRef.current.connect(ctx.destination);
      } else {
          source.connect(ctx.destination);
      }

      source.onended = () => {
          setStatus('Listening...');
          setIsTalking(false);
          if (videoRef.current) {
             videoRef.current.pause();
             videoRef.current.currentTime = 0;
          }
      };

      source.start(0);
      currentSourceRef.current = source;
  };

  const stopAudioPlayback = () => {
      if (currentSourceRef.current) {
          try { currentSourceRef.current.stop(); } catch(e) {}
          currentSourceRef.current = null;
      }
      setIsTalking(false);
      if (videoRef.current) videoRef.current.pause();
  };

  const syncLipMovement = () => {
    if (analyserRef.current && videoRef.current && !videoRef.current.error) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        if (average > 10) { // Lip sync threshold
            setIsTalking(true);
            // Safely attempt play
            const playPromise = videoRef.current.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Auto-play was prevented or source is invalid
                    // console.warn("Video play interrupted", error);
                });
            }
            videoRef.current.playbackRate = 1.0 + (average / 300); 
        } else {
            setIsTalking(false);
            if (!videoRef.current.paused) {
                videoRef.current.pause();
            }
        }
    }
    animationFrameRef.current = requestAnimationFrame(syncLipMovement);
  };

  // --- RENDER ---

  return (
    <div className="flex flex-col items-center justify-center h-full bg-slate-900 rounded-xl relative overflow-hidden border border-slate-700 p-4">
        
        {/* Video Avatar */}
        <div className="relative w-full max-w-sm aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl ring-1 ring-slate-700 mb-6">
            {profile.videoUrl ? (
                <video 
                    ref={videoRef}
                    src={profile.videoUrl} 
                    loop 
                    muted 
                    playsInline
                    className="w-full h-full object-cover"
                    onError={() => console.warn("Video failed to load")}
                />
            ) : (
                <img 
                    src={`data:image/png;base64,${profile.imageBase64}`} 
                    className="w-full h-full object-cover" 
                    alt="Avatar" 
                />
            )}
            
            {/* Status Overlays */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                 <div className={`px-3 py-1 rounded-full border flex items-center gap-2 backdrop-blur-md transition-colors ${
                     isProcessing ? 'bg-purple-500/80 border-purple-400 text-white' : 
                     status === 'Listening...' ? 'bg-green-500/80 border-green-400 text-white' : 
                     'bg-black/50 border-white/10 text-slate-300'
                 }`}>
                     <Activity size={12} className={status === 'Listening...' ? 'animate-pulse' : ''} />
                     <span className="text-xs font-medium">{status}</span>
                 </div>

                 {isTalking && (
                     <div className="px-2 py-1 bg-indigo-500/80 rounded-full animate-bounce">
                         <Volume2 size={12} className="text-white" />
                     </div>
                 )}
            </div>
        </div>

        {/* Controls */}
        <div className="text-center w-full max-w-md space-y-4">
            <div>
                <h2 className="text-2xl font-bold text-white mb-1">{profile.name}</h2>
                <p className="text-slate-400 text-xs uppercase tracking-wider font-medium">Live Persona Interface</p>
            </div>
            
            {error && (
                <div className="flex items-center justify-center gap-2 text-red-400 bg-red-900/20 p-2 rounded-lg text-sm">
                    <AlertCircle size={16} />
                    {error}
                </div>
            )}
            
            <div className="flex justify-center gap-6 mt-4">
                 <button 
                    onClick={() => setMicActive(!micActive)}
                    className={`p-4 rounded-full transition-all transform hover:scale-105 shadow-lg border ${micActive ? 'bg-slate-800 text-white border-slate-600 hover:bg-slate-700' : 'bg-red-500/20 text-red-400 border-red-500'}`}
                >
                    {micActive ? <Mic size={24} /> : <MicOff size={24} />}
                </button>

                <button 
                    onClick={onEndSession}
                    className="p-4 rounded-full bg-red-600 text-white hover:bg-red-500 transition-all transform hover:scale-105 shadow-lg shadow-red-900/30 border border-red-500"
                >
                    <PhoneOff size={24} />
                </button>
            </div>
        </div>
    </div>
  );
};

export default LiveSession;
