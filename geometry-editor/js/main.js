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
  normalized.groups = Registry.cloneGroups(normalized.groups); // never mutate the live app's own registry
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
    const groups = EditorState.fromText(jsonEditor.getValue());
    EditorState.setGroups(groups, { source: 'editor' });
    $('jsonError').textContent = '';
  } catch (e) {
    $('jsonError').textContent = e.message;
  }
}

// ---------- Meta (sku/label/kind) fields ----------
function refreshMetaFields(){
  const meta = EditorState.getMeta();
  $('skuInput').value = meta.sku || '';
  $('labelInput').value = meta.label || '';
  $('metaFieldset').style.display = meta.elementId ? '' : 'none';
  const pill = $('kindPill');
  pill.textContent = meta.elementId ? (meta.kind === 'singleton' ? 'singleton' : 'repeatable') : 'новый';
  pill.className = 'pill' + (meta.elementId ? '' : ' new');
}

function scopeSelect(){
  return $('scopeSelected').checked && EditorState.getSelection() ? 'selected' : 'all';
}

// ---------- Bootstrap ----------
(function init(){
  populateElementSelect();

  jsonEditor = CodeMirror.fromTextArea($('jsonEditor'), {
    mode: 'application/json',
    theme: 'dracula',
    lineNumbers: true,
    matchBrackets: true,
    indentUnit: 2,
    tabSize: 2,
  });

  Render.init({ svg: $('stage'), status: $('status'), info: $('previewInfoBar'), centerInfo: $('previewMeta') });
  ContourList.init({ list: $('contourList'), newContourLayer: $('newContourLayer') });

  // EditorState is the single source of truth; every view re-renders
  // itself in full on change — the geometry here is small (a handful of
  // contours per element), so full redraw is simpler and safer than
  // partial DOM/text patching. The one exception is the editor itself:
  // when the change originated FROM the editor (the person typing), we
  // must NOT call jsonEditor.setValue() again — replacing the whole
  // document on every keystroke is what made the tab hang (see
  // EditorState.notify's own comment on this). The preview and contour
  // list still update on every keystroke; only the editor's own text is
  // left alone while it's the source.
  EditorState.onChange((source) => {
    if (source !== 'editor') pushStateToEditor();
    Render.render();
    ContourList.render();
    refreshMetaFields();
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
  $('mirrorHBtn').addEventListener('click', () => Transform.mirror(scopeSelect(), 'h'));
  $('mirrorVBtn').addEventListener('click', () => Transform.mirror(scopeSelect(), 'v'));

  $('addContourBtn').addEventListener('click', () => ContourList.addContour());
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
          const groups = EditorState.fromText(reader.result);
          EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', groups, passthrough: {} });
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
