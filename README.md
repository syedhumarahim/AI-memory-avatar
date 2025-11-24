
# Back to Life - A Memory Avatar

## Motivation
Loss is a profound human experience, and often we are left wishing for just one more conversation with a loved one. "Back to Life" is motivated by the desire to use advanced AI not just for productivity, but for emotional connection. It bridges the gap between static memories (photos, diaries) and dynamic interaction, allowing users to "bring to life" a digital persona that feels familiar, warm, and responsive.

## Main Result/Conclusion
The project successfully delivers a "Memory Avatar" application. By combining visual identity (images), biographical data (memories), and linguistic patterns (style), we created a system that simulates a loved one's presence. The integration of high-fidelity voice synthesis and real-time audio interaction concludes that AI can be a powerful tool for reminiscence therapy and preserving family history in an engaging, interactive format.


## Artifact 

This artifact directly reflects course concepts regarding **Multimodal Large Language Models (LLMs)** and **Agentic Design**.
*   **Prompt Engineering:** We utilize sophisticated system instructions to enforce character consistency ("You are NOT an AI...").
*   **Multimodal Input/Output:** The app processes text, audio (PCM streams), and images, demonstrating the latest capabilities of the Gemini API.
*   **Real-time Interaction:** It implements the WebSocket-based Live API for low-latency conversational experiences.

### Explainability
An important component of this artifact is the **"Cognitive Decision Map" (Explainability Dashboard)**. 
AI systems are often "black boxes," making it hard to trust if a response is genuine to the persona or a generic hallucination. We introduced a "Brain" icon in the chat interface that allows users to peek inside the model's reasoning.

**How it is shown and portrayed:**
When a user inspects a response, a transparent "Glass Box" dashboard slides down, visualizing:
1.  **Influence Metrics (Bar Charts):** 
    *   **Personality Score:** How much did the defined traits (e.g., "Warmth") dictate this answer?
    *   **Memory Score:** Did this info come from the uploaded biography?
    *   **Style Score:** How closely does the syntax match the provided writing samples?
2.  **Cognitive Trace:** A text field displaying the internal reasoning of the model (e.g., *"I chose to mention the summer house because the user asked about vacations, and that fits the 'Nostalgic' personality trait defined in the profile"*).

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
