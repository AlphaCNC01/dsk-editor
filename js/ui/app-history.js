// ============================================================================
// UI app: project history — autosaves projects to localStorage on every
// change (with debounce), maintains a list of up to 20 most recent projects,
// and provides a dropdown menu for loading/deleting them. Each project gets
// a unique UUID for identification. Reuses UI.buildProjectData/applyProjectData
// from app-project.js, so history entries are exactly the same shape as
// saved .json project files.
// ============================================================================

(function(){
  const el = UI.el;

  const HISTORY_KEY = 'dskEditor.history.v1';
  const HISTORY_MAX_COUNT = 20;
  const AUTOSAVE_HISTORY_DEBOUNCE_MS = 2000;

  // ---------- UUID helper ----------
  function generateUUID(){
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ---------- History storage helpers ----------
  function getHistoryList(){
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveHistoryList(list){
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
    } catch (err) {
      // Quota exceeded or other storage error — silently ignore
    }
  }

  function getProjectFromHistory(id){
    try {
      const raw = localStorage.getItem('dskEditor.project.' + id);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function saveProjectToHistoryEntry(projectData, id, orderNumber, timestamp){
    try {
      localStorage.setItem('dskEditor.project.' + id, JSON.stringify(projectData));
    } catch (err) {
      // Ignore storage errors
    }
  }

  function removeProjectFromHistory(id){
    try {
      localStorage.removeItem('dskEditor.project.' + id);
    } catch (err) {
      // Ignore
    }
  }

  function addToHistory(projectData){
    const orderNumber = projectData.values.orderNumber || 'Без названия';
    const id = projectData.id || generateUUID();
    const timestamp = Date.now();

    let historyList = getHistoryList();

    // Check if this project already exists in history
    const existingIndex = historyList.findIndex(item => item.id === id);
    if (existingIndex !== -1) {
      // Update existing entry
      historyList[existingIndex] = { id, orderNumber, timestamp };
      // Move to front
      const existing = historyList.splice(existingIndex, 1)[0];
      historyList.unshift(existing);
    } else {
      // Add new entry at front
      historyList.unshift({ id, orderNumber, timestamp });
    }

    // Save full project data
    saveProjectToHistoryEntry(projectData, id, orderNumber, timestamp);

    // Trim to max count
    while (historyList.length > HISTORY_MAX_COUNT) {
      const removed = historyList.pop();
      removeProjectFromHistory(removed.id);
    }

    saveHistoryList(historyList);
    renderHistoryMenu();
  }

  function loadProjectFromHistory(id){
    const projectData = getProjectFromHistory(id);
    if (projectData) {
      try {
        UI.applyProjectData(projectData);
        // Update history timestamp on load
        addToHistory(projectData);
      } catch (err) {
        alert('Не удалось загрузить проект из истории: ' + err.message);
      }
    }
  }

  function deleteFromHistory(id, event){
    if (event) {
      event.stopPropagation();
    }
    if (!confirm('Удалить этот проект из истории?')) return;

    let historyList = getHistoryList();
    historyList = historyList.filter(item => item.id !== id);
    removeProjectFromHistory(id);
    saveHistoryList(historyList);
    renderHistoryMenu();
  }

  function formatDate(timestamp){
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      // Today: show time
      return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Вчера';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('ru-RU', { weekday: 'long' });
    } else {
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    }
  }

  function renderHistoryMenu(){
    const historyList = getHistoryList();
    const listEl = el('historyList');
    const emptyEl = listEl.parentElement.querySelector('.history-empty');

    if (!listEl) return;

    listEl.innerHTML = '';

    if (historyList.length === 0) {
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }

    if (emptyEl) emptyEl.style.display = 'none';

    historyList.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.setAttribute('data-id', item.id);
      div.title = 'Загрузить проект';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'history-item-info';

      const orderSpan = document.createElement('div');
      orderSpan.className = 'history-item-order';
      orderSpan.textContent = item.orderNumber;

      const dateSpan = document.createElement('div');
      dateSpan.className = 'history-item-date';
      dateSpan.textContent = formatDate(item.timestamp);

      infoDiv.appendChild(orderSpan);
      infoDiv.appendChild(dateSpan);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'history-item-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-action-btn delete';
      deleteBtn.title = 'Удалить из истории';
      deleteBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
      deleteBtn.addEventListener('click', (e) => deleteFromHistory(item.id, e));

      actionsDiv.appendChild(deleteBtn);

      div.appendChild(infoDiv);
      div.appendChild(actionsDiv);

      div.addEventListener('click', () => loadProjectFromHistory(item.id));

      listEl.appendChild(div);
    });
  }

  // ---------- History menu toggle ----------
  function toggleHistoryMenu(){
    const menu = el('historyMenu');
    const btn = el('historyMenuToggle');
    if (!menu || !btn) return;

    const isOpen = menu.classList.contains('open');
    menu.classList.toggle('open', !isOpen);
    btn.setAttribute('aria-expanded', !isOpen);
  }

  function closeHistoryMenu(){
    const menu = el('historyMenu');
    const btn = el('historyMenuToggle');
    if (!menu || !btn) return;

    menu.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }

  // ---------- Autosave timer ----------
  let historyTimer = null;
  function scheduleHistoryAutosave(){
    clearTimeout(historyTimer);
    historyTimer = setTimeout(() => {
      const data = UI.buildProjectData();
      // Assign or preserve UUID
      if (!data.id) {
        // Try to get existing ID from current history if order number matches
        const historyList = getHistoryList();
        const orderNumber = data.values.orderNumber || '';
        const matching = historyList.find(item => item.orderNumber === orderNumber);
        if (matching) {
          data.id = matching.id;
        } else {
          data.id = generateUUID();
        }
      }
      addToHistory(data);
    }, AUTOSAVE_HISTORY_DEBOUNCE_MS);
  }

  // ---------- Event listeners ----------
  el('historyMenuToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleHistoryMenu();
  });

  document.addEventListener('click', (e) => {
    if (!el('orderHeader').contains(e.target)) {
      closeHistoryMenu();
    }
  });

  // Hook into existing input events for autosave
  Object.values(UI.inputs).forEach(inp => {
    inp.addEventListener('input', scheduleHistoryAutosave);
    inp.addEventListener('change', scheduleHistoryAutosave);
  });

  el('controls').addEventListener('input', scheduleHistoryAutosave);
  el('controls').addEventListener('change', scheduleHistoryAutosave);
  el('controls').addEventListener('click', (e) => {
    if (e.target.closest('.instance-remove-btn, .anchor-grid-btn, .btn-add')) {
      scheduleHistoryAutosave();
    }
  });

  // Initial render
  renderHistoryMenu();
})();
