
# Back to Life - A Memory Avatar

**Link to the webapp:** https://copy-of-personaai-avatar-466019446946.us-west1.run.app

[![Memory Avatar Demo part 1](img1.png)](https://www.loom.com/share/6ef7fe0097d3421d913796c243ad0664)
[![Memory Avatar Demo part 2](img2.png)](https://www.loom.com/share/cdb9adc86b7d404298748dc0ff127c50)

## Motivation

Loss is a profound human experience, and often we are left wishing for just one more conversation with a loved one. *“Back to Life”* is motivated by the desire to use advanced AI not just for productivity, but for emotional connection. It bridges the gap between static memories (photos, diaries) and dynamic interaction, allowing users to *“bring to life”* a digital persona that feels familiar, warm, and responsive.

## System Architecture

*Back to Life* is implemented as a **browser-first Single Page Application (SPA)** using React 19 and TypeScript. All interaction, text, audio, memory retrieval, and explainability is orchestrated client-side with lightweight calls to external AI services and local RAG components to enable efficient long-term memory and personalization. Conceptually, the system is organized into five cooperating layers:

1. **Presentation Layer (UI/UX)**
2. **Audio Processing Layer (Web Audio API)**
3. **Intelligence Layer (AI Services)**
4. **Memory & RAG Engine (Client-Side Vector Store)**
5. **Explainability Engine (Hybrid)**


## 1. Presentation Layer (UI/UX)

**Technologies:** React 19, TypeScript, Tailwind CSS

This layer owns the interactive experience:

- **Views & Navigation**
  - `App.tsx` coordinates the three main views via an `AppView` enum:
    - **Creator** – `AvatarCreator` for building an `AvatarProfile` (name, personality, style samples, memories, image, voice).
    - **Chat** – `AvatarChat` for multimodal conversation, memory visualization, and per-message explainability.
    - **Live Session** – `LiveSession` (stub) for future real-time voice calls.
- **State Management**
  - Avatar profile and messages are stored in React state (hooks) for immediate responsiveness.
- **RAG Debugging UI**
  - The Chat interface displays the *“Retrieved Context”* for each message, allowing users to see exactly which past memories, style guides, or traits were retrieved and influenced the AI’s response.


## 2. Audio & Media Layer (Web Audio + Browser APIs)

**Technologies:** Web Audio API, `MediaRecorder`, custom utils in `utils/audioUtils.ts`

This layer handles all audio capture, transformation, and playback in the browser:

- **Input**
  - Uses `MediaRecorder` to capture microphone audio as WebM/WAV.
  - `blobToBase64` converts recordings into base64 so they can be sent directly to Gemini or ElevenLabs.
- **Output**
  - Raw audio bytes from Gemini TTS or ElevenLabs TTS are decoded via `AudioContext.decodeAudioData`.
  - Audio playback is scheduled for smooth, gapless listening.



## 3. Intelligence Layer (AI Orchestration & Persona)

**Technologies:** Google GenAI SDK (`@google/genai`), ElevenLabs API, `services/geminiService.ts`

This layer turns user inputs and avatar profiles into conversational, voiced responses via a *Retrieval-Augmented Generation* pipeline:

- **Generative Loop – `generateAvatarResponse(profile, userMessage)`**
  1. Embed user message into a vector for semantic retrieval.
  2. Retrieve relevant context from the Memory & RAG Engine (`memoryService.retrieveContext()`).
  3. Dynamic prompt is constructed that injects only the retrieved context (memories, style samples, traits) into the system prompt, rather than the full history.
  4. Generate the response via `gemini-2.5-flash`.
  5. Consolidate by storing the new interaction and, if applicable, learning new user traits in the RAG memory.

> **Note:** Retrieval-Augmented Generation (RAG) is a technique that enhances large language model outputs by retrieving relevant information from external stored data before generation, improving relevance and grounding.

- **Speech-to-Text (Transcription)**
  - `transcribeAudio(audioBase64)` sends inline audio to `gemini-2.5-flash`.
- **Text-to-Speech**
  - `generateSpeech(text)` calls `gemini-2.5-flash-preview-tts` to synthesize voice.
- **Embeddings**
  - `getEmbedding(text)` uses `text-embedding-004` for both retrieval and explainability metrics.



## 4. Memory & RAG Engine (Local Vector Store)

**Technologies:** `text-embedding-004`, Custom Vector Store (`services/memoryService.ts`)

To enable long-term memory and consistent personality without hitting context window limits, the app implements a **Client-Side RAG system** entirely in the browser:

- **Vector Store**
  - Breaks the avatar’s core biography, style samples, and memories into embedding vectors.
  - Stores every user interaction as episodic memory, as well as derived user traits.
  - Serves as a lightweight “vector database” running client-side (in the browser) to support retrieval based on semantic relevance.
  - A vector store encodes data into semantic vectors and supports similarity search, enabling efficient retrieval of context.
- **Retrieval Logic**
  - For each user message, the system:
    1. Computes semantic similarity between the query and stored vectors.
    2. Applies time decay (favoring recent memories).
    3. Applies importance weighting (ensuring core facts or traits rank higher).
  - The top ranked memory chunks are injected into prompts to ground the model’s responses.

This approach aligns with common RAG patterns where external data is embedded and retrieved to augment language model generation.


## 5. Explainability Engine (Hybrid Scoring + Cognitive Trace)

**Technologies:** `text-embedding-004`, `gemini-2.5-flash`, `ExplanationAnalysis`

This layer is responsible for making each response inspectable and understandable, rather than a black box:

- **Core Function – `explainResponse(profile, userMessage, botResponse)`**
  - **Embedding & Scoring:** Embed response + memories + style samples + personality.
  - **Cosine similarity metrics** generate alignment scores (0–100%).
  - **Narrative Explanation:** A constrained LLM query generates natural-language reasoning describing why the model responded as it did.


## Deep Dive into Implementation

### Models Used

1. **Conversational Core:** `gemini-2.5-flash`  
   * Handles dynamic conversation, influenced by RAG prompt context.

2. **Semantic Analysis:** `text-embedding-004`  
   * Converts text into numeric embeddings for use in both RAG retrieval and explainability scoring.

3. **Speech-to-Text & Text-to-Speech:** Gemini TTS and STT  
   * Handles multimodal interaction (voice-in, voice-out).



## The “Memory Loop”

A unique feature of this architecture is the self-improving memory loop:

1. Interaction: User says something.  
2. Retrieval: Relevant RAG context is fetched.  
3. Generation: Avatar responds (in persona).  
4. Storage: The interaction is saved into the vector store.  
5. Async Analysis: A background process queries the model for new preferences/traits, which, if applicable, are committed back into RAG memory.


## Main Result / Conclusion

The project successfully delivers a *“Memory Avatar”* application. By combining visual identity, biographical memories, style, and a client-side RAG architecture, we created a system that simulates a loved one’s presence with contextual continuity across sessions. The integration of high-fidelity voice synthesis and real-time multimodal interaction concludes that AI can be a powerful tool for reminiscence therapy and preserving family history in an engaging, interactive format.


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
