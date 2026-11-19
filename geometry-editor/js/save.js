// ============================================================================
// Save — turns the current EditorState back into the project's data file.
//
// All element variants now live in ONE plain data file,
// js/data/element-variants.js (see js/core/element-data.js). Save rebuilds
// that WHOLE file in memory — the page already loaded every variant via
// ElementData.raw() — swaps in the edited variant (sku, label, contours,
// extras like supplierSku/cableNode kept as they were) and serializes it
// with ElementData.serialize(), the same serializer that wrote the file in
// the first place. So the downloaded file is a drop-in replacement: no
// find-and-paste of one block, and untouched variants come out unchanged.
//
// This editor still cannot write the file on disk by itself (file:// has
// no write access, and on GitHub Pages the repo is read-only from here),
// so Save downloads element-variants.js; put it over js/data/element-
// variants.js (or hand it to whoever commits).
//
// Blank geometry (no source element attached) has no variant to replace,
// so Save just downloads the parts: [ ... ] entries in the same data
// format, for pasting into a variant's `parts` in the data file.
// ============================================================================
const Save = (() => {

  // Edited variant, keeping the stored field order. Fields the editor owns
  // (sku, label, parts) take the edited values; everything else (supplier
  // fields, cableNode, width/height...) keeps what the data file had unless
  // the editor loaded a newer value in `passthrough`.
  function mergeVariant(stored, meta, entries){
    const out = {};
    const base = stored || { sku: '', label: '', supplierSku: '', supplierMark: '', parts: [] };
    for (const k of Object.keys(base)) {
      if (k === 'sku') out.sku = meta.sku;
      else if (k === 'label') out.label = meta.label;
      else if (k === 'parts') out.parts = entries;
      else out[k] = Object.prototype.hasOwnProperty.call(meta.passthrough, k) ? meta.passthrough[k] : base[k];
    }
    for (const k of Object.keys(meta.passthrough)) if (!(k in out)) out[k] = meta.passthrough[k];
    return out;
  }

  function buildDataFile(){
    const meta = EditorState.getMeta();
    const data = ElementData.raw();
    if (!data[meta.elementId]) data[meta.elementId] = {};
    const stored = data[meta.elementId][meta.variantKey];
    data[meta.elementId][meta.variantKey] = mergeVariant(stored, meta, EditorState.getEntries());
    return ElementData.serialize(data);
  }

  function buildEntriesText(){
    return EditorState.getEntries().map(e => '        ' + ElementData.entryText(e) + ',').join('\n');
  }

  function buildSnippet(){
    const meta = EditorState.getMeta();
    return meta.elementId ? buildDataFile() : buildEntriesText();
  }

  function downloadFile(text, filename){
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function save(){
    const meta = EditorState.getMeta();
    if (meta.elementId) {
      downloadFile(buildDataFile(), 'element-variants.js');
    } else {
      const header = '// Новая геометрия — вставьте как содержимое parts: [ ... ] нужного варианта в js/data/element-variants.js:\n\n';
      downloadFile(header + buildEntriesText() + '\n', 'new-element.parts.snippet.js');
    }
  }

  return { buildSnippet, buildDataFile, save };
})();
