// ============================================================================
// apps/engineer/js/main.js — the engineer app's entry point.
//
// Every js/ui/*.js module used to be a bare IIFE that read/wrote a single
// shared `UI` global, with load order (the <script> tag sequence in
// index.html) doing double duty as the dependency graph: whatever ran
// first had to not need anything defined by a later script YET (only by
// the time an actual event fired). That worked, but it meant the real
// dependency graph only existed implicitly, in script order — invisible
// to anyone reading a single file.
//
// As ES modules, that implicit graph has to become explicit — this file
// IS that graph, written out: each js/ui/*.js module now exports a
// setup function taking its own dependencies as parameters (instead of
// reaching for `UI.something`) and returning whatever other modules need
// from it, and main.js below calls them in the order that actually
// satisfies every dependency, once, at startup.
//
// A few of the old circular-looking references (field-helpers.js/
// element-managers.js needing render(), which itself needs
// element-managers.js's own ELEMENT_MANAGERS array; app-project.js
// needing app-history.js's callbacks, which themselves need
// app-project.js's buildProjectData/applyProjectData) are resolved the
// same way real circular dependencies always are: something has to be
// called first and get its missing piece filled in slightly later,
// via a small indirection (a getter function) rather than a direct
// reference. See initProjectIO's own comment for the specific case.
// ============================================================================

import '@shared-css/styles.css'; // imported (not a <link> in index.html) so `vite build` actually bundles it — a <link href="../../packages/..."> pointing outside apps/engineer's own root wouldn't be picked up by the production build, only by `vite dev`'s own dev-server passthrough

import { Drawing } from '@core/index.js';
import { Dimensions, RenderSVG } from '@render/index.js';
import { ExportDXF, ExportSVG, ExportPNG, ExportGCode } from '@export/index.js';
import '@elements/index.js'; // side-effect only: registers every element (see packages/elements/index.js's own comment)

import { el } from './ui/instance-list.js';
import { buildElementManagers } from './ui/element-managers.js';
import { initRender } from './ui/app-render.js';
import { initProjectIO } from './ui/app-project.js';
import { initHistory, getHistorySessionId, setHistorySessionId } from './ui/app-history.js';
import { initAutosave } from './ui/app-state.js';
import { populateUnderframeTypeOptions } from './ui/underframe-options.js';

function boot(resetZoom){
  // underframe.js's own registration already ran (via the '@elements/index.js'
  // import above); this fills in the <select id="underframeType">'s options
  // from its VARIANTS — see underframe-options.js's own comment for why this
  // moved out of packages/elements.
  populateUnderframeTypeOptions();

  // 1. Build every repeatable-element manager (chargers, pockets, etc).
  //    Needs render/debouncedRender to wire each row's own onChange, but
  //    initRender (step 2) needs THIS array back — resolved by building
  //    the render functions first (step 2 depends on nothing from step 1
  //    except the array itself, which render()/debouncedRender() don't
  //    touch until actually CALLED, well after both steps have returned)
  //    and only then constructing the managers with real callbacks.
  //
  //    Concretely: initRender needs `elementManagers` up front to close
  //    over it in readParams/render, so it has to come from somewhere
  //    that doesn't itself need `render` yet. buildElementManagers is
  //    called with THIN wrapper functions that simply forward to
  //    whatever `render`/`debouncedRender` end up being once initRender
  //    has run — safe because no manager actually CALLS onChange/
  //    onFieldChange until the user interacts with a row, which can only
  //    happen after boot() has fully returned.
  let render, debouncedRender;
  const elementManagers = buildElementManagers({
    render: () => render(),
    debouncedRender: () => debouncedRender(),
  });

  // 2. Render loop + export actions — needs the elementManagers array
  //    from step 1.
  const renderApi = initRender({
    el, elementManagers, Drawing, Dimensions, RenderSVG, ExportSVG, ExportDXF, ExportPNG, ExportGCode,
  });
  render = renderApi.render;
  debouncedRender = renderApi.debouncedRender;

  // 3. Project save/load + the export-menu/save-load button wiring.
  //    getStartNewHistorySession/getUpsertHistoryEntry are getters
  //    (not direct references) because step 4 (initHistory) hasn't run
  //    yet at this point — see initProjectIO's own comment.
  let historyApi = null;
  const projectApi = initProjectIO({
    el,
    inputs: renderApi.inputs,
    elementManagers,
    render: renderApi.render,
    debouncedRender: renderApi.debouncedRender,
    resetZoom,
    runExport: renderApi.runExport,
    toggleExportMenu: renderApi.toggleExportMenu,
    closeExportMenu: renderApi.closeExportMenu,
    sanitizeFilename: renderApi.sanitizeFilename,
    getStartNewHistorySession: () => historyApi && historyApi.startNewHistorySession,
    getUpsertHistoryEntry: () => historyApi && historyApi.upsertHistoryEntry,
  });

  // 4. Project history dropdown — needs buildProjectData/applyProjectData
  //    from step 3.
  historyApi = initHistory({
    el,
    inputs: renderApi.inputs,
    buildProjectData: projectApi.buildProjectData,
    applyProjectData: projectApi.applyProjectData,
  });

  // 5. Autosave/share-link/reset — the last thing to run, since it fires
  //    the very first render() once it's decided where the initial state
  //    comes from (shared link > session draft > blank form).
  initAutosave({
    el,
    inputs: renderApi.inputs,
    buildProjectData: projectApi.buildProjectData,
    applyProjectData: projectApi.applyProjectData,
    render: renderApi.render,
    startNewHistorySession: historyApi.startNewHistorySession,
    upsertHistoryEntry: historyApi.upsertHistoryEntry,
    getHistorySessionId,
    setHistorySessionId,
  });
}

// zoom.js wires its own DOM listeners (and reads #preview/#stage/
// #zoomControls) at CALL time (see initZoom's own comment), so it's
// imported dynamically here, inside bootWithZoom(), rather than as a
// static top-level import — that guarantees it only runs once the DOM
// it needs actually exists (see this file's own DOMContentLoaded guard
// below), the same guarantee the old <script> tag's position at the end
// of <body> used to provide implicitly.
async function bootWithZoom(){
  const { initZoom } = await import('@ui-preview/zoom.js');
  const { resetZoom } = initZoom();
  boot(resetZoom);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootWithZoom);
} else {
  bootWithZoom();
}
