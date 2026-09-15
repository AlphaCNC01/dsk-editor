// ============================================================================
// UI app: project save/load + event wiring. Serializes every raw form
// field plus each instance list's raw items — i.e. exactly what the user
// typed/selected, not the resolved geometry (positions, contours) that's
// derived from it — so a loaded project re-derives its drawing the same
// way a freshly-typed one would, including picking up any live defaults
// (underframe-linked insets etc) that were left blank on purpose. Ends by
// wiring every input/button to render/debouncedRender and firing the
// first render().
//
// Exported as initProjectIO(deps) — an orchestration entry point called
// once from this app's own main.js after every other piece it needs
// (elementManagers, render/debouncedRender, resetZoom, runExport, the
// export-menu toggles, sanitizeFilename, inputs, and the history
// callbacks) already exists — rather than a bare module-level IIFE
// reaching for those through a shared UI global. Returns
// { buildProjectData, applyProjectData } for main.js to hand to
// app-history.js/app-state.js, which need the exact same
// serialize/apply pair for their own share-link and autosave paths.
// ============================================================================

export function initProjectIO({
  el, inputs, elementManagers, render, debouncedRender, resetZoom,
  runExport, toggleExportMenu, closeExportMenu, sanitizeFilename,
  getStartNewHistorySession, getUpsertHistoryEntry,
}){

  const PROJECT_FILE_VERSION = 1;
  const SIMPLE_INPUT_IDS = [
    'orderNumber', 'rectW', 'rectH', 'rectThickness', 'rTop', 'rBottom', 'rNotch',
    'notchOn', 'notchH', 'notchBottom', 'notchTop',
    'underframeType', 'underframeInsetH', 'underframeInsetV',
    'dimensionsOn', 'schematicOn', 'woodTint',
  ];

  function buildProjectData(){
    const values = {};
    for (const id of SIMPLE_INPUT_IDS) {
      const input = el(id);
      values[id] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return {
      fileType: 'tabletop-layout-project',
      version: PROJECT_FILE_VERSION,
      values,
      instances: Object.fromEntries(elementManagers.map(({ key, mgr }) => [key, mgr.items])),
    };
  }

  function saveProject(){
    const data = buildProjectData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sanitizeFilename(inputs.orderNumber.value) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function applyProjectData(data){
    if (!data || data.fileType !== 'tabletop-layout-project' || !data.values) {
      throw new Error('Файл не похож на проект столешницы.');
    }
    for (const id of SIMPLE_INPUT_IDS) {
      if (!(id in data.values)) continue;
      const input = el(id);
      const val = data.values[id];
      if (input.type === 'checkbox') input.checked = !!val;
      else input.value = val === null || val === undefined ? '' : val;
    }
    const inst = data.instances || {};
    // Migrate pre-list top-notch projects: older files (before top
    // notches became a repeatable list) stored a single notch as plain
    // fields on `values` (topNotchType/topNotchWidth/topNotchOffset/
    // rTopNotch) instead of an `instances.topNotches` array. If this file
    // predates the list (no topNotches array present at all) but has a
    // real configured notch in the old fields, turn it into a one-item
    // list so the loaded drawing matches what the old file actually
    // showed, instead of silently losing that notch.
    if (!inst.topNotches) {
      const v = data.values;
      const oldType = v && v.topNotchType;
      const oldWidth = v && parseFloat(v.topNotchWidth);
      if ((oldType === 'tslot' || oldType === 'rect') && oldWidth > 0) {
        inst.topNotches = [{
          type: oldType,
          width: oldWidth,
          offset: parseFloat(v.topNotchOffset) || 0,
          r: parseFloat(v.rTopNotch) || 0,
        }];
      }
    }
    for (const { key, mgr } of elementManagers) mgr.setItems(inst[key]);
    render();
    // A loaded project is a new drawing — any zoom/pan left over from
    // whatever was on screen before shouldn't carry over onto it.
    if (resetZoom) resetZoom();
  }

  function loadProject(file){
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        applyProjectData(data);
        // Loading a project from disk is a new work session, distinct
        // from whatever was open before — see app-history.js.
        const startNewHistorySession = getStartNewHistorySession && getStartNewHistorySession();
        const upsertHistoryEntry = getUpsertHistoryEntry && getUpsertHistoryEntry();
        if (startNewHistorySession) startNewHistorySession();
        if (upsertHistoryEntry) upsertHistoryEntry();
      } catch (err) {
        alert('Не удалось загрузить проект: ' + err.message);
      }
    };
    reader.onerror = () => alert('Не удалось прочитать файл.');
    reader.readAsText(file);
  }

  Object.values(inputs).forEach(inp => {
    inp.addEventListener('input', debouncedRender);
    inp.addEventListener('change', debouncedRender);
  });
  el('exportMainBtn').addEventListener('click', () => runExport('png'));
  el('exportMenuToggle').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleExportMenu();
  });
  el('exportMenu').querySelectorAll('button[data-format]').forEach(btn => {
    btn.addEventListener('click', () => runExport(btn.dataset.format));
  });
  document.addEventListener('click', (e) => {
    if (!el('exportSplit').contains(e.target)) closeExportMenu();
  });
  el('saveProjectBtn').addEventListener('click', saveProject);
  el('loadProjectBtn').addEventListener('click', () => el('loadProjectInput').click());
  el('loadProjectInput').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) loadProject(file);
    e.target.value = ''; // allow re-selecting the same file later
  });

  // Returned for main.js to hand to app-history.js/app-state.js:
  // URL-share/sessionStorage/reset use the exact same "raw form values +
  // raw instance arrays" serialization as the JSON project file, and
  // applying it goes through the same migration path (old single-notch
  // fields -> topNotches list, etc). The initial render() call itself is
  // left to app-state.js, since it's the one that decides whether the
  // very first paint should come from a shared URL, this tab's own
  // session draft, or the blank defaults already sitting in the form.
  return { buildProjectData, applyProjectData };
}
