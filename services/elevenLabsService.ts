
// Service for interacting with ElevenLabs API

export const createElevenLabsVoice = async (apiKey: string, name: string, sampleBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('name', name);
  // Matches Python: files={"files": (filename, file_obj, content_type)}
  // JS FormData handles content-type automatically based on Blob
  formData.append('files', sampleBlob, 'sample_audio.wav'); 
  formData.append('description', 'Cloned via PersonaAI');
  
  // Optional labels
  const labels = JSON.stringify({ "accent": "auto" });
  formData.append('labels', labels);

  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      // Do NOT set Content-Type header manually for FormData; fetch sets it with boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("ElevenLabs Add Voice Error", errorData);
    throw new Error(`ElevenLabs Error: ${errorData.detail?.message || response.statusText}`);
  }

  const data = await response.json();
  return data.voice_id;
};

export const generateElevenLabsSpeech = async (apiKey: string, voiceId: string, text: string): Promise<ArrayBuffer> => {
  // Matches Python reference model_id
  const modelId = "eleven_multilingual_v2"; 
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("ElevenLabs TTS Error", errorData);
    throw new Error(`ElevenLabs TTS Error: ${errorData.detail?.message || response.statusText}`);
  }

  return await response.arrayBuffer();
};
