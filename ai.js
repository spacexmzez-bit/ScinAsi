/**
 * ai.js
 * Handles communication between client UI and Cloudflare Worker AI endpoints.
 * Routes to:
 * - POST /api/ai/chat (Context-aware bench assistant with 3.5 Flash Lite -> 3.1 Flash Lite fallback)
 * - POST /api/ai/inspire (Structured JSON experiment generator)
 */

class AIService {
  constructor() {
    this.messageHistory = [];
  }

  /**
   * Clears conversational memory (e.g. when switching active experiments)
   */
  resetChat() {
    this.messageHistory = [];
  }

  /**
   * Sends user prompt with active experiment context to the Worker edge
   */
  async askBenchAssistant(userMessage, experimentContext = null) {
    const workerUrl = await window.localDB.getSetting("worker_url");
    const authToken = await window.localDB.getSetting("auth_token");

    if (!workerUrl || !authToken) {
      throw new Error("Worker URL or Auth Token missing. Configure them in Settings (gear icon).");
    }

    const endpoint = `${workerUrl.replace(/\/+$/, "")}/api/ai/chat`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        experimentContext,
        messageHistory: this.messageHistory,
        userMessage,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `AI proxy error: status ${response.status}`);
    }

    const data = await response.json();

    // Preserve conversational context
    this.messageHistory.push({ role: "user", content: userMessage });
    this.messageHistory.push({ role: "assistant", content: data.reply });

    return {
      reply: data.reply,
      modelUsed: data.model,
    };
  }

  /**
   * Generates a complete experiment specification using parameters
   */
  async generateInspiration(criteria) {
    const workerUrl = await window.localDB.getSetting("worker_url");
    const authToken = await window.localDB.getSetting("auth_token");

    if (!workerUrl || !authToken) {
      throw new Error("Worker URL or Auth Token missing. Configure them in Settings (gear icon).");
    }

    const endpoint = `${workerUrl.replace(/\/+$/, "")}/api/ai/inspire`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(criteria),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Inspiration generator error: status ${response.status}`);
    }

    const data = await response.json();
    return data.experiment;
  }
}

window.aiService = new AIService();
