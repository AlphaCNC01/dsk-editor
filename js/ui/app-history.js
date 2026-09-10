// ============================================================================
// UI app: project history — keeps a rolling list of recently edited
// projects in localStorage (persists across tabs/browser restarts, unlike
// the per-tab sessionStorage draft in app-state.js) and lets the user pick
// one back up from a dropdown menu next to the order-number field.
//
// One entry per "work session", not one entry per autosave tick: editing
// the same project over and over updates a single history entry in place
// (keyed by UI.historySessionId), rather than flooding the list with near-
// duplicate snapshots. A new session starts whenever the user explicitly
// begins a different project — loading a project (file, history, or a
// pasted share link) or hitting Reset — so the history entry always
// reflects "the last thing I had open for this project", and switching
// between two projects in the same tab doesn't blur their history rows
// together.
//
// Reuses UI.buildProjectData/applyProjectData (app-project.js), so a
// history snapshot is exactly the same shape as a saved .json file or the
// sessionStorage draft.
// ============================================================================

(function(){
  const el = UI.el;

  const HISTORY_KEY = 'dskEditor.history.v1';
  const HISTORY_DEBOUNCE_MS = 600;
  const MAX_HISTORY_ENTRIES = 20;

  function makeSessionId(){
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  // The "current project" identity for history purposes. Starts fresh on
  // every page load (a freshly opened tab hasn't "worked on" anything
  // yet) and is only reassigned when the user explicitly loads a
  // different project or resets — see startNewHistorySession below.
  UI.historySessionId = makeSessionId();

  function loadHistory(){
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (err) {
      return [];
    }
  }

  function saveHistory(list){
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (err) {
      // Quota exceeded / private mode — losing history isn't fatal.
    }
  }

  // Writes/updates the entry for the current session, most-recent-first,
  // capped at MAX_HISTORY_ENTRIES (oldest dropped first).
  function upsertHistoryEntry(){
    const data = UI.buildProjectData();
    const orderNumber = (data.values && data.values.orderNumber) || '(без номера)';
    let list = loadHistory();
    list = list.filter(entry => entry.id !== UI.historySessionId);
    list.unshift({
      id: UI.historySessionId,
      orderNumber,
      updatedAt: Date.now(),
      data,
    });
    if (list.length > MAX_HISTORY_ENTRIES) list = list.slice(0, MAX_HISTORY_ENTRIES);
    saveHistory(list);
    renderHistoryMenu();
  }

  let historyTimer = null;
  function scheduleHistorySave(){
    clearTimeout(historyTimer);
    historyTimer = setTimeout(upsertHistoryEntry, HISTORY_DEBOUNCE_MS);
  }

  function formatTimestamp(ms){
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // Rebuilds the dropdown's list of history rows. Each row is clickable
  // (loads that project) except for its own delete button, which stops
  // propagation so a click there removes the entry instead of loading it.
  function renderHistoryMenu(){
    const list = loadHistory();
    const listEl = el('historyList');
    const emptyEl = document.querySelector('.history-empty');
    listEl.innerHTML = '';
    if (!list.length) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    for (const entry of list) {
      const row = document.createElement('div');
      row.className = 'history-item';
      row.dataset.id = entry.id;
      row.innerHTML = `
        <div class="history-item-info">
          <div class="history-item-order">${escapeHtml(entry.orderNumber)}</div>
          <div class="history-item-date">${formatTimestamp(entry.updatedAt)}</div>
        </div>
        <div class="history-item-actions">
          <button type="button" class="history-action-btn delete" title="Удалить из истории" aria-label="Удалить из истории">
            <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      `;
      row.addEventListener('click', () => loadFromHistory(entry.id));
      row.querySelector('.history-action-btn.delete').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteHistoryEntry(entry.id);
      });
      listEl.appendChild(row);
    }
  }

  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function deleteHistoryEntry(id){
    const list = loadHistory().filter(entry => entry.id !== id);
    saveHistory(list);
    renderHistoryMenu();
  }

  function loadFromHistory(id){
    const entry = loadHistory().find(e => e.id === id);
    if (!entry) return;
    UI.applyProjectData(entry.data);
    // Picking up an existing history entry resumes *that* session rather
    // than starting a new one — further edits keep updating this same
    // row instead of forking a duplicate.
    UI.historySessionId = entry.id;
    closeHistoryMenu();
  }

  // Starts a brand-new history session, detached from whatever was being
  // edited before. Called whenever the user explicitly swaps projects
  // (load from file, load from a pasted share link, reset) so that
  // continuing to edit afterwards doesn't silently overwrite the
  // previous project's history row with the new one's contents.
  function startNewHistorySession(){
    UI.historySessionId = makeSessionId();
  }

  // ---------- dropdown open/close, mirroring #exportSplit's own toggle ----------
  function openHistoryMenu(){
    renderHistoryMenu();
    el('historyMenu').classList.add('open');
    el('historyMenuToggle').setAttribute('aria-expanded', 'true');
  }
  function closeHistoryMenu(){
    el('historyMenu').classList.remove('open');
    el('historyMenuToggle').setAttribute('aria-expanded', 'false');
  }
  function toggleHistoryMenu(){
    if (el('historyMenu').classList.contains('open')) closeHistoryMenu();
    else openHistoryMenu();
  }

  el('historyMenuToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHistoryMenu();
  });
  document.addEventListener('click', (e) => {
    if (!el('orderSplit').contains(e.target)) closeHistoryMenu();
  });

  // Same trigger set as app-state.js's sessionStorage autosave: every
  // top-level input, plus a delegated listener on #controls for
  // dynamically-rebuilt instance-list rows.
  Object.values(UI.inputs).forEach(inp => {
    inp.addEventListener('input', scheduleHistorySave);
    inp.addEventListener('change', scheduleHistorySave);
  });
  el('controls').addEventListener('input', scheduleHistorySave);
  el('controls').addEventListener('change', scheduleHistorySave);
  el('controls').addEventListener('click', (e) => {
    if (e.target.closest('.instance-remove-btn, .anchor-grid-btn, .btn-add')) {
      scheduleHistorySave();
    }
  });

  renderHistoryMenu();

  UI.startNewHistorySession = startNewHistorySession;
  UI.upsertHistoryEntry = upsertHistoryEntry;
  UI.renderHistoryMenu = renderHistoryMenu;
})();
