// ============================================================================
// Main — bootstrap for the geometry editor.
//
// The JSON pane uses CodeMirror for syntax highlighting (loaded from CDN
// in index.html) — the only external dependency this editor pulls in.
// Everything else (zoom/pan, layer colors, path rendering, layout tokens)
// comes from the real project's own files, reused directly rather than
// reimplemented or pulled from a library.
//
// UI.el (needed by js/zoom.js, loaded earlier — see index.html) is
// defined in js/ui-shim.js, not here.
// ============================================================================

let jsonEditor; // CodeMirror instance
let suppressNextEditorEvent = false; // set while EditorState -> editor push happens, so that push doesn't re-trigger an editor -> EditorState parse

function $(id){ return document.getElementById(id); }

// ---------- Element / variant pickers ----------
function populateElementSelect(){
  const sel = $('elemSelect');
  const elements = Registry.editableElements();
  sel.innerHTML =
    `<option value="">— новая геометрия —</option>` +
    elements.map(e => `<option value="${e.id}">${e.id}</option>`).join('');
}

function populateVariantSelect(){
  const varSel = $('elemVariant');
  const group = $('elemVariantGroup');
  const elementId = $('elemSelect').value;
  if (!elementId) { varSel.innerHTML = ''; group.style.display = 'none'; return; }
  const element = Elements.all().find(e => e.id === elementId);
  const keys = Object.keys(element.VARIANTS);
  varSel.innerHTML = keys.map(k => {
    const v = element.VARIANTS[k];
    const text = v.sku && v.label ? `${v.sku} — ${v.label}` : (v.label || v.sku || k);
    return `<option value="${k}">${text}</option>`;
  }).join('');
  group.style.display = keys.length > 1 ? '' : 'none';
}

function loadSelectedElement(){
  const elementId = $('elemSelect').value;
  if (!elementId) { EditorState.loadBlank(); return; }
  const element = Elements.all().find(e => e.id === elementId);
  const variantKey = $('elemVariant').value || Object.keys(element.VARIANTS)[0];
  const normalized = Registry.normalizeVariant(element, variantKey);
  normalized.entries = Registry.cloneEntries(normalized.entries); // never mutate the live app's own registry
  EditorState.load(normalized);
}

// ---------- Editor <-> state ----------
function pushStateToEditor(){
  suppressNextEditorEvent = true;
  jsonEditor.setValue(EditorState.toText());
  suppressNextEditorEvent = false;
  $('jsonError').textContent = '';
}

function pushEditorToState(){
  try {
    const entries = EditorState.fromText(jsonEditor.getValue());
    EditorState.setEntries(entries, { source: 'editor' });
    $('jsonError').textContent = '';
  } catch (e) {
    $('jsonError').textContent = e.message;
  }
}

// Clicking a contour in the SVG preview (see render.js's own click
// handler, which calls EditorState.setSelection) moves the JSON pane's
// cursor to that entry's line and scrolls it into view — this is the
// entire "which code does this shape belong to" story for this editor;
// there's no separate contour list to keep in sync with the text, so
// pointing at the text directly is both the simplest wiring and removes
// an entire second view of the same data that could drift from it.
function jumpEditorToSelection(){
  const sel = EditorState.getSelection();
  if (sel == null) return;
  const line = EditorState.lineForSelection(sel);
  if (line == null) return;
  jsonEditor.setCursor({ line, ch: 0 });
  jsonEditor.scrollIntoView({ line, ch: 0 }, 60);
  jsonEditor.addLineClass(line, 'background', 'selected-line');
  if (jumpEditorToSelection._lastLine != null && jumpEditorToSelection._lastLine !== line) {
    jsonEditor.removeLineClass(jumpEditorToSelection._lastLine, 'background', 'selected-line');
  }
  jumpEditorToSelection._lastLine = line;
}

// ---------- Meta (sku/label/kind) fields ----------
function refreshMetaFields(){
  const meta = EditorState.getMeta();
  $('skuInput').value = meta.sku || '';
  $('labelInput').value = meta.label || '';
  $('metaFieldset').style.display = meta.elementId ? '' : 'none';
  const pill = $('kindPill');
  pill.textContent = meta.elementId ? meta.kind : 'новый';
  pill.className = 'pill' + (meta.elementId ? '' : ' new');
}

function scopeSelect(){
  return $('scopeSelected').checked && EditorState.getSelection() ? 'selected' : 'all';
}

// ---------- Bootstrap ----------
(function init(){
  populateElementSelect();

  jsonEditor = CodeMirror.fromTextArea($('jsonEditor'), {
    mode: 'javascript',
    theme: 'dracula',
    lineNumbers: true,
    matchBrackets: true,
    indentUnit: 2,
    tabSize: 2,
  });

  Render.init({ svg: $('stage'), status: $('status'), info: $('previewInfoBar'), centerInfo: $('previewMeta') });

  // EditorState is the single source of truth; every view re-renders
  // itself in full on change — the geometry here is small (a handful of
  // contours per element), so full redraw is simpler and safer than
  // partial DOM/text patching. The one exception is the editor itself:
  // when the change originated FROM the editor (the person typing), we
  // must NOT call jsonEditor.setValue() again — replacing the whole
  // document on every keystroke is what made the tab hang (see
  // EditorState.notify's own comment on this). The preview still updates
  // on every keystroke; only the editor's own text is left alone while
  // it's the source.
  EditorState.onChange((source) => {
    if (source !== 'editor') pushStateToEditor();
    Render.render();
    refreshMetaFields();
    if (source !== 'editor') jumpEditorToSelection();
  });

  jsonEditor.on('change', () => {
    if (suppressNextEditorEvent) return;
    pushEditorToState();
  });

  $('elemSelect').addEventListener('change', () => { populateVariantSelect(); loadSelectedElement(); });
  $('elemVariant').addEventListener('change', loadSelectedElement);

  $('skuInput').addEventListener('input', () => EditorState.setSkuLabel($('skuInput').value, $('labelInput').value));
  $('labelInput').addEventListener('input', () => EditorState.setSkuLabel($('skuInput').value, $('labelInput').value));

  document.querySelectorAll('.origin-grid button[data-pos]').forEach(btn => {
    btn.addEventListener('click', () => Transform.setOrigin(scopeSelect(), btn.dataset.pos));
  });
  $('applyOffsetBtn').addEventListener('click', () => {
    const dx = parseFloat($('offsetX').value) || 0;
    const dy = parseFloat($('offsetY').value) || 0;
    Transform.offset(scopeSelect(), dx, dy);
  });
  $('applyRotateBtn').addEventListener('click', () => {
    const angle = parseFloat($('rotateAngle').value) || 0;
    Transform.rotate(scopeSelect(), angle);
  });
  $('mirrorHBtn').addEventListener('click', () => Transform.mirror(scopeSelect(), 'horizontal'));
  $('mirrorVBtn').addEventListener('click', () => Transform.mirror(scopeSelect(), 'vertical'));

  $('saveBtn').addEventListener('click', () => Save.save());

  $('preview').addEventListener('click', (ev) => {
    if (ev.target.id === 'preview') EditorState.setSelection(null);
  });

  $('fileInput').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (file.name.endsWith('.svg')) {
        importSvgText(reader.result);
      } else {
        try {
          const entries = EditorState.fromText(reader.result);
          EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', entries, passthrough: {} });
        } catch (e) {
          Render.setStatus('Ошибка импорта: ' + e.message, true);
        }
      }
    };
    reader.readAsText(file);
    ev.target.value = '';
  });

  EditorState.loadBlank();

  // CodeMirror mis-measures its own height if it initializes while its
  // container is display:none or mid-layout-transition (happens here
  // since #jsonEditor starts as a plain <textarea> inside a fieldset
  // whose final size depends on the grid layout settling) — one refresh
  // after layout is stable fixes it without needing to delay
  // CodeMirror.fromTextArea's own creation.
  requestAnimationFrame(() => jsonEditor.refresh());
})();
