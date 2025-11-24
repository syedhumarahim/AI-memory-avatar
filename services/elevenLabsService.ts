
// Service for interacting with ElevenLabs API

export const createElevenLabsVoice = async (apiKey: string, name: string, sampleBlob: Blob): Promise<string> => {
  const formData = new FormData();
  formData.append('name', name);
  
  // Determine correct extension to ensure ElevenLabs accepts the file
  let extension = 'mp3';
  if (sampleBlob.type.includes('webm')) extension = 'webm';
  else if (sampleBlob.type.includes('wav')) extension = 'wav';
  else if (sampleBlob.type.includes('ogg')) extension = 'ogg';
  else if (sampleBlob.type.includes('m4a')) extension = 'm4a';
  
  formData.append('files', sampleBlob, `voice_sample.${extension}`); 
  
  formData.append('description', 'Cloned via PersonaAI');
  
  const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      // Content-Type is set automatically by fetch for FormData
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = errorText;
    try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail?.message || errorJson.detail || errorText;
    } catch (e) {}
    
    console.error("ElevenLabs Add Voice Error", errorMessage);
    throw new Error(`ElevenLabs Error: ${errorMessage}`);
  }

  const data = await response.json();
  return data.voice_id;
};

export const generateElevenLabsSpeech = async (apiKey: string, voiceId: string, text: string): Promise<ArrayBuffer> => {
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
    const errorText = await response.text();
    console.error("ElevenLabs TTS Error", errorText);
    throw new Error(`ElevenLabs TTS Error: ${response.status} ${response.statusText}`);
  }

  return await response.arrayBuffer();
};