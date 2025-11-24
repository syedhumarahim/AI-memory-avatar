
# Back to Life - A Memory Avatar

**Link to the webapp:** https://copy-of-personaai-avatar-466019446946.us-west1.run.app

[![Memory Avatar Demo part 1](https://img.youtube.com/vi/abc123XYZ/hqdefault.jpg)](https://www.loom.com/share/6ef7fe0097d3421d913796c243ad0664)
[![Memory Avatar Demo part 2](https://img.youtube.com/vi/abc123XYZ/hqdefault.jpg)](https://www.loom.com/share/cdb9adc86b7d404298748dc0ff127c50)

## Motivation
Loss is a profound human experience, and often we are left wishing for just one more conversation with a loved one. "Back to Life" is motivated by the desire to use advanced AI not just for productivity, but for emotional connection. It bridges the gap between static memories (photos, diaries) and dynamic interaction, allowing users to "bring to life" a digital persona that feels familiar, warm, and responsive.

## System Architecture

Back to Life is implemented as a **browser-first Single Page Application (SPA)** using React 19 and TypeScript. All interaction, text, audio, and explainability, is orchestrated client-side with lightweight calls to external AI services. Conceptually, the system is organized into four cooperating layers:

1.  **Presentation Layer (UI/UX)**:
    *   Built with React and Tailwind CSS.
    *   Manages user input (text/voice), avatar visualization, and the dynamic "Glass Box" explainability dashboard.
    *   State is managed locally using React Hooks to ensure immediate responsiveness.

2.  **Audio Processing Layer (Web Audio API)**:
    *   **Input**: Captures microphone streams, converts them to raw PCM 16-bit (16kHz) data using `ScriptProcessorNode`, and buffers them for transmission.
    *   **Output**: Receives raw PCM audio chunks or MP3 streams, decodes them asynchronously using `AudioContext`, and schedules them for playback to ensure gapless audio.

3.  **Intelligence Layer (AI Services)**:
    *   **Orchestrator**: `Google GenAI SDK` (@google/genai) manages the connection to Gemini models.
    *   **Voice Synthesis**: Integrates both Gemini's Native Audio and ElevenLabs' Voice Cloning API for high-fidelity personalization.

4.  **Explainability Engine (Hybrid)**:
    *   A dedicated service that combines **Vector Embeddings** for mathematical scoring and **LLM Reasoning** for narrative explanation to provide transparency into the model's behavior.


### 1. Presentation Layer (UI/UX)

**Technologies:** React 19, TypeScript, Tailwind CSS  

This layer owns the interactive experience:

- **Views & Navigation**
  - `App.tsx` coordinates the three main views via an `AppView` enum:
    - **Creator** – `AvatarCreator` for building an `AvatarProfile` (name, personality, style samples, memories, image, voice).
    - **Chat** – `AvatarChat` for multimodal conversation and per-message explainability.
    - **Live Session** – `LiveSession` (stub) for future real-time voice calls.
- **State Management**
  - Avatar profile and messages are stored in React state (hooks) for immediate responsiveness.
- **Explainability UI**
  - The “Glass Box” panel is rendered inside `AvatarChat`, showing alignment scores and cognitive trace for each model response.

### 2. Audio & Media Layer (Web Audio + Browser APIs)

**Technologies:** Web Audio API, `MediaRecorder`, custom utils in `utils/audioUtils.ts`  

This layer handles all audio capture, transformation, and playback in the browser:

- **Input**
  - Uses `MediaRecorder` to capture microphone audio as WebM/WAV.
  - `blobToBase64` converts recordings into base64 so they can be sent directly to Gemini or ElevenLabs.
- **Output**
  - Raw audio bytes from Gemini TTS or ElevenLabs TTS are decoded via `AudioContext.decodeAudioData`.
  - Audio playback is scheduled for smooth, gapless listening.
- **Format Handling**
  - Utility helpers manage base64 ↔ `Uint8Array` conversion and enforce the expected sample rate (e.g., 16 kHz).

### 3. Intelligence Layer (AI Orchestration & Persona)

**Technologies:** Google GenAI SDK (`@google/genai`), ElevenLabs API, `services/`  

This layer turns user inputs and avatar profiles into conversational, voiced responses:

- **Gemini Integration – `services/geminiService.ts`**
  - `generateAvatarResponse(profile, userMessage)`
    - Builds a **system prompt** using `buildSystemPrompt(profile)` (from `utils/promptUtils.ts`).
    - Encodes the avatar’s **personality**, **memories**, and **style samples** into the model context.
    - Uses `gemini-2.5-flash` as the conversational core.
  - `transcribeAudio(audioBase64)`
    - Sends inline audio to `gemini-2.5-flash` for speech-to-text.
  - `generateSpeech(text)`
    - Calls `gemini-2.5-flash-preview-tts` to synthesize voice for standard voices.
  - `getEmbedding(text)`
    - Uses `text-embedding-004` to obtain embeddings for explainability metrics.
- **Voice Cloning – `services/elevenLabsService.ts`**
  - `createElevenLabsVoice(name, sampleBlob)`
    - Creates a custom voice using a short microphone recording.
  - `generateElevenLabsSpeech(voiceId, text)`
    - Synthesizes avatar responses using the cloned voice.
- **Profile & Types – `types.ts`**
  - `AvatarProfile` defines the complete configuration for an avatar (name, personality text, styleSamples, memories, image, voice settings).
  - Shared types like `ExplanationAnalysis` and enums keep all data flows well-typed.

> This layer is where **persona embodiment** happens: the model is instructed to speak *as* the defined memory avatar while respecting explicit safety and style constraints.

### 4. Explainability Engine (Hybrid Scoring + Cognitive Trace)

**Technologies:** `text-embedding-004`, `gemini-2.5-flash`, `ExplanationAnalysis`  

This layer is responsible for making each response **inspectable and understandable**, rather than a black box.

- **Core Function – `explainResponse(profile, userMessage, botResponse)`**
  1. **Vector Embedding & Scoring**
     - Embeds:
       - The avatar’s **response text**
       - The avatar’s **memories** (biographical text)
       - The **style samples** (writing corpus)
       - The **personality description**
     - Computes cosine similarity between the response vector and each source vector.
     - Normalizes these into 0–100 alignment scores:
       - **Personality Score**
       - **Memories Score**
       - **Style Score**
  2. **Narrative Explanation (“Cognitive Trace”)**
     - Calls `gemini-2.5-flash` again with a **strict JSON schema** and the numeric scores:
       - e.g., “The response had a Memory Vector Score of 82% and a Style Vector Score of 45%. Explain why.”
     - The model returns:
       - A short natural-language explanation of how the response relates to the provided memories and style.
       - Any caveats (e.g., low style alignment).

- **UI Presentation**
  - `AvatarChat` renders:
    - A per-message **Glass Box** showing the three scores.
    - A concise explanation of *why* the avatar responded that way.

> This hybrid design combines deterministic math (embeddings + cosine similarity) with constrained LLM reasoning, aligning directly with the course themes of **XAI** and **interpretable ML**: the model does not “grade itself” from scratch, it explains measured behavior.


Together, these layers create a cohesive system where:
- The **UI** collects inputs and presents the avatar.
- The **Audio Layer** makes interaction multimodal.
- The **Intelligence Layer** orchestrates Gemini + ElevenLabs into a consistent persona.
- The **Explainability Engine** turns each response into a transparent, inspectable event — critical for responsible use in a sensitive domain like memory and loss.

## Deep Dive into Implementation

### Models Used
The system utilizes a multi-model approach to optimize for latency, quality, and modality:

1.  **Conversational Core**: `gemini-2.5-flash`
    *   **Role**: Handles the text-based chat logic, persona embodiment, and memory retrieval.
    *   **Why**: Selected for its balance of high reasoning capabilities and low latency, essential for maintaining the illusion of a living conversation.

2.  **Speech-to-Text (Transcription)**: `gemini-2.5-flash`
    *   **Role**: Processes user audio blobs (WebM/WAV) from the chat interface and converts them to text.
    *   **Implementation**: We send the audio binary directly as an `inlineData` part in the prompt, leveraging Gemini's native multimodal understanding rather than a separate STT service.

3.  **Text-to-Speech (TTS)**: `gemini-2.5-flash-preview-tts`
    *   **Role**: Generates instant, emotive speech for standard voices.
    *   **Implementation**: Returns raw audio bytes which are immediately decoded and played by the browser.

4.  **Semantic Analysis**: `text-embedding-004`
    *   **Role**: Converts text (Memories, Personality, Responses) into 768-dimensional vectors.
    *   **Use Case**: Used exclusively in the Explainability Engine to calculate the mathematical "closeness" of the bot's response to the source material.

5.  **Real-Time Live Interaction**: `gemini-2.5-flash-native-audio-preview-09-2025`
    *   **Role**: Powers the "Voice Call" feature.
    *   **Implementation**: Uses a persistent WebSocket connection. Audio is streamed bidirectionally. The model receives audio chunks and outputs audio chunks in real-time, allowing for interruptions and natural turn-taking.

### Technical Explainability: Hybrid Decision Mapping

We implement a **Hybrid Explainability** approach. Instead of relying solely on an LLM to "hallucinate" its own performance scores (which can be inaccurate), we use deterministic vector math for the metrics and an LLM for the qualitative explanation.

**1. The Mathematical Score (Vector Space Model):**
When the user requests an explanation, we trigger the `explainResponse` service:
*   **Step A (Embedding)**: We run parallel requests to `text-embedding-004` to generate vector embeddings for:
    1.  The *Response Text* (What the bot said).
    2.  The *Memories Text* (The source biography).
    3.  The *Style Samples* (The source writing).
    4.  The *Personality Definition* (The traits).
*   **Step B (Cosine Similarity)**: We calculate the Cosine Similarity between the *Response Vector* and each *Source Vector*.
    *   `Similarity(A, B) = (A · B) / (||A|| ||B||)`
    *   This results in a value between -1 and 1. A higher value indicates strict semantic alignment. We normalize this to a percentage (0-100%) for the UI.
    *   **Result**: "Memory Score: 82%" means the response is mathematically 82% similar in vector space to the provided memories.

**2. The Narrative Trace (LLM):**
*   After calculating the scores, we feed them into a `gemini-2.5-flash` instance with a specific prompt:
    *   *"The response had a Memory Vector Score of 82% and a Style Vector Score of 45%. Explain why."*
*   This ensures the LLM provides a reasoning that is **grounded in the actual mathematical data**, rather than making up its own justification.

## Main Result/Conclusion
The project successfully delivers a "Memory Avatar" application. By combining visual identity (images), biographical data (memories), and linguistic patterns (style), we created a system that simulates a loved one's presence. The integration of high-fidelity voice synthesis and real-time audio interaction concludes that AI can be a powerful tool for reminiscence therapy and preserving family history in an engaging, interactive format.

## Artifact 
This artifact directly reflects course concepts regarding **Multimodal Large Language Models (LLMs)** and **Agentic Design**.
*   **Prompt Engineering:** We utilize sophisticated system instructions to enforce character consistency ("You are NOT an AI...").
*   **Multimodal Input/Output:** The app processes text, audio (PCM streams), and images, demonstrating the latest capabilities of the Gemini API.
*   **Vector Embeddings:** We use high-dimensional vector spaces to provide actual technical interpretability of the model's outputs.

### Best Practices
*   **Modular Architecture:** The codebase separates logic into Services (`geminiService.ts`, `elevenLabsService.ts`) and UI Components.
*   **Robust Type Definitions:** All data flows are strictly typed via TypeScript interfaces (`AvatarProfile`, `ExplanationAnalysis`).
*   **Resilient Audio Handling:** Custom utilities handle raw PCM audio decoding/encoding to ensure compatibility across browsers without relying on heavy external libraries.

### Documentation
The code is structured to be self-documenting with clear variable naming and organization:
*   `src/components/`: Contains the React UI views (Creator, Chat, LiveSession).
*   `src/services/`: Handles all external API communication (Google GenAI, ElevenLabs).
*   `src/utils/`: Contains helper functions for audio buffer manipulation.

### Instructions to Run Final Project

1.  **Prerequisites:**
    *   Node.js installed.
    *   A Google Cloud Project with Gemini API enabled.
    *   An ElevenLabs API Key (optional, for voice cloning).

2.  **Installation:**
    Navigate to the project root and install dependencies:
    ```bash
    npm install
    ```

3.  **Configuration:**
    *   **Gemini API:** Ensure `process.env.API_KEY` is set, or update `HARDCODED_API_KEY` in `services/geminiService.ts`.
    *   **ElevenLabs API:** Update `HARDCODED_XI_API_KEY` in `services/elevenLabsService.ts` if you wish to use voice cloning features.

4.  **Running the App:**
    Start the development server:
    ```bash
    npm start
    ```
    Open `http://localhost:3000` (or the provided local URL) in your browser.

5.  **Usage Guide:**
    *   **Create:** Upload a photo, enter a name, and paste text samples/memories.
    *   **Chat:** Type or speak to the avatar. Click the **Brain Icon** on any message to see the *Explainability Analysis*.
    *   **Voice Call:** Switch to the live tab for a hands-free voice conversation.
