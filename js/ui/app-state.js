// ============================================================================
// UI app: persistence — autosaves the current layout into sessionStorage on
// every change (so a page reload doesn't lose it), encodes the same data
// into a shareable URL (#state=...) only when the user asks for one via the
// "Поделиться" button, and provides a full reset back to blank defaults.
// Reuses UI.buildProjectData/applyProjectData from app-project.js, so a
// stored/shared snapshot is exactly the same shape as a saved .json project
// file. This is the last script to load and is the one that fires the very
// first render(), choosing the source in priority order: URL link (if the
// page was opened via a shared link) > this tab's own session draft > blank
// form.
//
// sessionStorage rather than localStorage is deliberate: it's scoped per
// tab, not per origin, so several tabs/projects open at once never clobber
// each other's autosave the way a shared localStorage key would. A pasted
// share link is immediately absorbed into this tab's sessionStorage and the
// hash is stripped from the address bar right after — the URL is only ever
// a transport for handing a snapshot to another tab/person, never the live
// state store itself, so it doesn't grow unbounded as the user keeps editing.
// ============================================================================

(function(){
  const el = UI.el;

  const STORAGE_KEY = 'dskEditor.draft.v1';
  const HASH_PREFIX = '#state=';
  const AUTOSAVE_DEBOUNCE_MS = 400;

  // ---------- base64url helpers (works on raw bytes, not just text) ----------
  function bytesToBase64Url(bytes){
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function base64UrlToBytes(str){
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // ---------- optional gzip compression ----------
  // CompressionStream/DecompressionStream are built into modern browsers
  // (no library, no build step) but aren't universal, so both encode and
  // decode fall back gracefully to plain (uncompressed) base64url. A 'Z'
  // vs 'R' marker prefix on the payload records which path was used, so a
  // link generated on one browser still decodes correctly on another.
  const hasCompression = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

  async function encodeState(data){
    const json = JSON.stringify(data);
    const bytes = new TextEncoder().encode(json);
    if (hasCompression) {
      try {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
        return 'Z' + bytesToBase64Url(compressed);
      } catch (err) {
        // Fall through to uncompressed below if compression itself failed.
      }
    }
    return 'R' + bytesToBase64Url(bytes);
  }

  async function decodeState(payload){
    const marker = payload[0];
    const body = payload.slice(1);
    const bytes = base64UrlToBytes(body);
    if (marker === 'Z') {
      if (!hasCompression) throw new Error('Эта ссылка сжата, а браузер не поддерживает распаковку.');
      const ds = new DecompressionStream('gzip');
      const writer = ds.writable.getWriter();
      writer.write(bytes);
      writer.close();
      const plain = new Uint8Array(await new Response(ds.readable).arrayBuffer());
      return JSON.parse(new TextDecoder().decode(plain));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // ---------- sessionStorage autosave (per-tab, doesn't leak across tabs) ----------
  function saveDraftLocally(){
    try {
      const data = UI.buildProjectData();
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (err) {
      // Quota exceeded, private-mode restrictions, etc. — losing autosave
      // isn't fatal, so this stays silent rather than interrupting the user.
    }
  }

  function loadDraftLocally(){
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function clearDraftLocally(){
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
  }

  let autosaveTimer = null;
  function scheduleAutosave(){
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(saveDraftLocally, AUTOSAVE_DEBOUNCE_MS);
  }

  // ---------- share link ----------
  // Builds a one-off URL carrying the current snapshot. This is purely a
  // transport format for handing the layout to another tab or person — it's
  // never read back from location.hash as the live state (see
  // loadInitialState: a pasted link is absorbed into sessionStorage and the
  // hash is stripped right after), so it never needs to track edits made
  // after the link was generated.
  async function buildShareUrl(){
    const data = UI.buildProjectData();
    const payload = await encodeState(data);
    const url = new URL(location.href);
    url.hash = HASH_PREFIX.slice(1) + payload;
    return url.toString();
  }

  async function copyToClipboard(text){
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        // Falls through to the manual-copy prompt below (e.g. clipboard
        // permission denied, or unavailable on a plain file:// page).
      }
    }
    return false;
  }

  async function shareProject(){
    const btn = el('shareProjectBtn');
    const label = btn.querySelector('span');
    const originalLabel = label.textContent;
    try {
      const url = await buildShareUrl();
      const copied = await copyToClipboard(url);
      if (copied) {
        label.textContent = 'Скопировано!';
        setTimeout(() => { label.textContent = originalLabel; }, 1800);
      } else {
        window.prompt('Скопируйте ссылку на макет:', url);
      }
    } catch (err) {
      alert('Не удалось создать ссылку: ' + err.message);
    }
  }

  // ---------- reset ----------
  function resetProject(){
    if (!confirm('Сбросить текущий макет и начать заново? Несохранённые изменения будут потеряны.')) return;
    clearDraftLocally();
    // A full reload onto a clean URL (no #state hash) is the simplest way
    // to get every input, every instance list and the zoom/pan back to
    // exactly their first-load state, instead of trying to reset each
    // piece of UI state by hand.
    location.hash = '';
    location.reload();
  }

  // ---------- initial load: URL link (one-time import) > this tab's own session draft > blank defaults ----------
  async function loadInitialState(){
    const hash = location.hash || '';
    if (hash.startsWith(HASH_PREFIX)) {
      const payload = hash.slice(HASH_PREFIX.length);
      try {
        const data = await decodeState(payload);
        UI.applyProjectData(data);
        // The link has done its job (handing this tab a snapshot) — absorb
        // it into this tab's own session draft and strip the hash from the
        // address bar immediately, via replaceState (no new history entry,
        // no reload). From this point on the URL is plain again and the
        // sessionStorage draft is the only thing that persists across a
        // reload of this tab, so the link itself never keeps growing as the
        // user keeps editing.
        saveDraftLocally();
        history.replaceState(null, '', location.pathname + location.search);
        return;
      } catch (err) {
        alert('Не удалось разобрать ссылку на макет: ' + err.message + '\nБудет открыт черновик по умолчанию.');
        location.hash = '';
      }
    }
    const draft = loadDraftLocally();
    if (draft) {
      try {
        UI.applyProjectData(draft);
        return;
      } catch (err) {
        // Corrupt/incompatible session draft — fall through to a blank
        // render rather than blocking the app from opening at all.
      }
    }
    UI.render();
  }

  el('shareProjectBtn').addEventListener('click', shareProject);
  el('resetProjectBtn').addEventListener('click', resetProject);

  // Every input already triggers UI.render()/debouncedRender() elsewhere
  // (app-project.js); autosave piggybacks on the same events plus the
  // instance-list add/remove/field changes, all of which end up calling
  // render() one way or another, so listening on the same top-level inputs
  // plus a delegated listener on #controls catches list rows too (they're
  // rebuilt into the DOM dynamically, so per-input listeners added at
  // load time wouldn't reach them).
  Object.values(UI.inputs).forEach(inp => {
    inp.addEventListener('input', scheduleAutosave);
    inp.addEventListener('change', scheduleAutosave);
  });
  el('controls').addEventListener('input', scheduleAutosave);
  el('controls').addEventListener('change', scheduleAutosave);
  el('controls').addEventListener('click', (e) => {
    if (e.target.closest('.instance-remove-btn, .anchor-grid-btn, .btn-add')) {
      scheduleAutosave();
    }
  });

  loadInitialState();
})();
