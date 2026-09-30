/**
 * app.js
 * Primary application controller for ScinAsi.
 * Handles DOM events, card rendering, workspace editing, markdown formatting, and AI drawer interactions.
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Initialize local IndexedDB engine
  await window.localDB.init();

  // State
  let currentExperiment = null;
  let activeTab = "tab-overview";
  let tempRequirements = [];
  let tempRoadmap = [];

  // DOM Elements - Navigation & Actions
  const cardsGrid = document.getElementById("cards-grid");
  const searchInput = document.getElementById("search-input");
  const genreFilter = document.getElementById("genre-filter");
  const difficultyFilter = document.getElementById("difficulty-filter");
  const btnCreateCard = document.getElementById("btn-create-card");
  const btnSyncTrigger = document.getElementById("btn-sync-trigger");
  const syncIndicator = document.getElementById("sync-indicator");

  // DOM Elements - Settings Modal
  const modalSettings = document.getElementById("modal-settings");
  const btnOpenSettings = document.getElementById("btn-open-settings");
  const btnCloseSettings = document.getElementById("btn-close-settings");
  const formSettings = document.getElementById("form-settings");
  const settingWorkerUrl = document.getElementById("setting-worker-url");
  const settingAuthToken = document.getElementById("setting-auth-token");

  // DOM Elements - Workspace Modal
  const modalWorkspace = document.getElementById("modal-card-workspace");
  const btnCloseWorkspace = document.getElementById("btn-close-workspace");
  const btnSaveWorkspace = document.getElementById("btn-save-workspace");
  const wsTitle = document.getElementById("ws-title");
  const wsGenre = document.getElementById("ws-genre");
  const wsDifficulty = document.getElementById("ws-difficulty");
  const wsDuration = document.getElementById("ws-duration");
  const wsOverview = document.getElementById("ws-overview");
  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // DOM Elements - Requirements & Roadmap Editors
  const inputReqItem = document.getElementById("input-requirement-item");
  const btnAddReq = document.getElementById("btn-add-requirement");
  const wsRequirementsList = document.getElementById("ws-requirements-list");
  const inputStepTitle = document.getElementById("input-step-title");
  const inputStepInstruction = document.getElementById("input-step-instruction");
  const btnAddStep = document.getElementById("btn-add-step");
  const wsRoadmapList = document.getElementById("ws-roadmap-list");

  // DOM Elements - Assistant Drawer
  const btnToggleAssistant = document.getElementById("btn-toggle-assistant");
  const assistantDrawer = document.getElementById("assistant-drawer");
  const btnCloseAssistant = document.getElementById("btn-close-assistant");
  const assistantContextTag = document.getElementById("assistant-context-tag");
  const chatMessages = document.getElementById("chat-messages");
  const chatInput = document.getElementById("chat-input");
  const btnSendChat = document.getElementById("btn-send-chat");

  // DOM Elements - Inspiration Modal
  const modalInspire = document.getElementById("modal-inspire");
  const btnOpenInspire = document.getElementById("btn-open-inspire");
  const btnCloseInspire = document.getElementById("btn-close-inspire");
  const formInspire = document.getElementById("form-inspire");

  // --- Initial Setup & Data Hydration ---

  async function loadSettings() {
    settingWorkerUrl.value = (await window.localDB.getSetting("worker_url")) || "";
    settingAuthToken.value = (await window.localDB.getSetting("auth_token")) || "";
  }

  // Monitor sync events to update status badge
  window.syncManager.onSyncStatusChange(({ status, message }) => {
    syncIndicator.className = `status-dot ${status}`;
    if (status === "synced") renderCardsGrid();
    if (message && status === "error") alert(message);
  });

  // Load existing experiment cards
  async function renderCardsGrid() {
    const query = searchInput.value.toLowerCase().trim();
    const genre = genreFilter.value;
    const diff = difficultyFilter.value;

    let experiments = await window.localDB.getAllExperiments();

    experiments = experiments.filter((exp) => {
      const matchesQuery = !query || exp.title.toLowerCase().includes(query) || exp.overview.toLowerCase().includes(query);
      const matchesGenre = genre === "all" || exp.genre === genre;
      const matchesDiff = diff === "all" || exp.difficulty === diff;
      return matchesQuery && matchesGenre && matchesDiff;
    });

    cardsGrid.innerHTML = "";

    if (experiments.length === 0) {
      cardsGrid.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 2rem;">No experiments found. Create one or generate with Inspiration AI.</div>`;
      return;
    }

    experiments.forEach((exp) => {
      const card = document.createElement("article");
      card.className = "experiment-card";
      card.innerHTML = `
        <div>
          <h2 class="card-title">${escapeHTML(exp.title)}</h2>
          <div class="card-meta-row">
            <span class="badge genre">${escapeHTML(exp.genre)}</span>
            <span class="badge">${escapeHTML(exp.difficulty)}</span>
            <span class="badge">${escapeHTML(exp.duration)}</span>
          </div>
          <p class="card-desc">${escapeHTML(exp.overview)}</p>
        </div>
        <div class="card-footer">
          <span>${(exp.requirements || []).length} items &bull; ${(exp.roadmap || []).length} steps</span>
          <button class="btn btn-secondary btn-open-card" data-id="${exp.id}">Open</button>
        </div>
      `;

      card.querySelector(".btn-open-card").addEventListener("click", () => openWorkspace(exp.id));
      cardsGrid.appendChild(card);
    });
  }

  // --- Workspace Modal Operations ---

  function openWorkspace(experimentId = null) {
    if (experimentId) {
      window.localDB.getExperiment(experimentId).then((exp) => {
        if (!exp) return;
        currentExperiment = exp;
        tempRequirements = [...(exp.requirements || [])];
        tempRoadmap = [...(exp.roadmap || [])];

        wsTitle.value = exp.title;
        wsGenre.value = exp.genre;
        wsDifficulty.value = exp.difficulty;
        wsDuration.value = exp.duration;
        wsOverview.value = exp.overview;

        assistantContextTag.textContent = exp.title;
        renderRequirementsList();
        renderRoadmapSteps();
        modalWorkspace.classList.remove("hidden");
      });
    } else {
      // New experiment blank slate
      currentExperiment = {
        id: "exp_" + Date.now(),
        created_at: Date.now(),
      };
      tempRequirements = [];
      tempRoadmap = [];

      wsTitle.value = "";
      wsGenre.value = "Physics";
      wsDifficulty.value = "Beginner";
      wsDuration.value = "30 mins";
      wsOverview.value = "";

      assistantContextTag.textContent = "New Experiment";
      renderRequirementsList();
      renderRoadmapSteps();
      modalWorkspace.classList.remove("hidden");
    }
  }

  function closeWorkspace() {
    modalWorkspace.classList.add("hidden");
    currentExperiment = null;
  }

  async function saveWorkspace() {
    const title = wsTitle.value.trim();
    if (!title) {
      alert("Please provide an experiment title.");
      return;
    }

    const payload = {
      id: currentExperiment.id,
      title: title,
      genre: wsGenre.value,
      difficulty: wsDifficulty.value,
      duration: wsDuration.value.trim() || "Unspecified",
      overview: wsOverview.value.trim(),
      requirements: tempRequirements,
      roadmap: tempRoadmap,
      created_at: currentExperiment.created_at || Date.now(),
      updated_at: Date.now(),
    };

    await window.localDB.putExperiment(payload);
    closeWorkspace();
    renderCardsGrid();
    window.syncManager.runSync();
  }

  // --- Requirements & Roadmap Helpers ---

  function renderRequirementsList() {
    wsRequirementsList.innerHTML = "";
    tempRequirements.forEach((req, idx) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${escapeHTML(req)}</span>
        <button class="btn-close" style="font-size: 1rem;" data-index="${idx}">&times;</button>
      `;
      li.querySelector("button").addEventListener("click", () => {
        tempRequirements.splice(idx, 1);
        renderRequirementsList();
      });
      wsRequirementsList.appendChild(li);
    });
  }

  function renderRoadmapSteps() {
    wsRoadmapList.innerHTML = "";
    tempRoadmap.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "step-card";
      card.innerHTML = `
        <div class="step-card-header">
          <span>Step ${idx + 1}: ${escapeHTML(step.title)}</span>
          <button class="btn-close" style="font-size: 1rem;" data-index="${idx}">&times;</button>
        </div>
        <div class="step-instruction">${window.marked ? window.marked.parse(step.instruction) : escapeHTML(step.instruction)}</div>
      `;
      card.querySelector("button").addEventListener("click", () => {
        tempRoadmap.splice(idx, 1);
        renderRoadmapSteps();
      });
      wsRoadmapList.appendChild(card);
    });
  }

  btnAddReq.addEventListener("click", () => {
    const val = inputReqItem.value.trim();
    if (val) {
      tempRequirements.push(val);
      inputReqItem.value = "";
      renderRequirementsList();
    }
  });

  btnAddStep.addEventListener("click", () => {
    const title = inputStepTitle.value.trim();
    const instruction = inputStepInstruction.value.trim();
    if (title && instruction) {
      tempRoadmap.push({ step: tempRoadmap.length + 1, title, instruction });
      inputStepTitle.value = "";
      inputStepInstruction.value = "";
      renderRoadmapSteps();
    }
  });

  // --- Workspace Tabs ---

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetPane = document.getElementById(btn.dataset.tab);
      if (targetPane) targetPane.classList.add("active");
      activeTab = btn.dataset.tab;
    });
  });

  // --- Bench Assistant Chat Operations ---

  function appendChatMessage(role, markdownContent) {
    const msg = document.createElement("div");
    msg.className = `chat-msg ${role}`;
    msg.innerHTML = window.marked ? window.marked.parse(markdownContent) : escapeHTML(markdownContent);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function handleSendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = "";
    appendChatMessage("user", text);

    // Provide context if currently focused on an experiment
    const context = currentExperiment
      ? {
          title: wsTitle.value || currentExperiment.title,
          overview: wsOverview.value || currentExperiment.overview,
          requirements: tempRequirements,
          roadmap: tempRoadmap,
        }
      : null;

    appendChatMessage("assistant", "*Thinking...*");
    const loadingElem = chatMessages.lastElementChild;

    try {
      const { reply } = await window.aiService.askBenchAssistant(text, context);
      loadingElem.innerHTML = window.marked ? window.marked.parse(reply) : escapeHTML(reply);
    } catch (err) {
      loadingElem.innerHTML = `<span style="color: var(--accent-danger);">Error: ${escapeHTML(err.message)}</span>`;
    }
  }

  btnSendChat.addEventListener("click", handleSendMessage);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  });

  btnToggleAssistant.addEventListener("click", () => assistantDrawer.classList.toggle("hidden"));
  btnCloseAssistant.addEventListener("click", () => assistantDrawer.classList.add("hidden"));

  // --- Inspiration Engine ---

  btnOpenInspire.addEventListener("click", () => modalInspire.classList.remove("hidden"));
  btnCloseInspire.addEventListener("click", () => modalInspire.classList.add("hidden"));

  formInspire.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById("btn-run-inspire");
    btnSubmit.disabled = true;
    btnSubmit.textContent = "Synthesizing...";

    const criteria = {
      genre: document.getElementById("inspire-genre").value,
      difficulty: document.getElementById("inspire-difficulty").value,
      requirementsComplexity: document.getElementById("inspire-complexity").value,
      duration: document.getElementById("inspire-duration").value,
    };

    try {
      const generated = await window.aiService.generateInspiration(criteria);
      modalInspire.classList.add("hidden");

      // Populate into workspace
      openWorkspace();
      wsTitle.value = generated.title || "";
      wsGenre.value = generated.genre || "Physics";
      wsDifficulty.value = generated.difficulty || "Beginner";
      wsDuration.value = generated.duration || "30 mins";
      wsOverview.value = generated.overview || "";
      tempRequirements = generated.requirements || [];
      tempRoadmap = generated.roadmap || [];

      renderRequirementsList();
      renderRoadmapSteps();
    } catch (err) {
      alert(`Inspiration error: ${err.message}`);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Generate Experiment";
    }
  });

  // --- Settings Form ---

  btnOpenSettings.addEventListener("click", () => modalSettings.classList.remove("hidden"));
  btnCloseSettings.addEventListener("click", () => modalSettings.classList.add("hidden"));

  formSettings.addEventListener("submit", async (e) => {
    e.preventDefault();
    await window.localDB.setSetting("worker_url", settingWorkerUrl.value.trim());
    await window.localDB.setSetting("auth_token", settingAuthToken.value.trim());
    modalSettings.classList.add("hidden");
    window.syncManager.runSync();
  });

  // --- Search & Filters ---

  searchInput.addEventListener("input", renderCardsGrid);
  genreFilter.addEventListener("change", renderCardsGrid);
  difficultyFilter.addEventListener("change", renderCardsGrid);
  btnCreateCard.addEventListener("click", () => openWorkspace());
  btnCloseWorkspace.addEventListener("click", closeWorkspace);
  btnSaveWorkspace.addEventListener("click", saveWorkspace);
  btnSyncTrigger.addEventListener("click", () => window.syncManager.runSync());

  // Utility to prevent basic XSS
  function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, (tag) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    }[tag] || tag));
  }

  // Initial runs
  await loadSettings();
  await renderCardsGrid();
  window.syncManager.runSync();
});
