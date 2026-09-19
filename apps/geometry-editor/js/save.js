// ============================================================================
// Save — turns the current EditorState back into source code matching the
// real project's own hand-written style in js/elements/*.js, so pasting the
// output back in reads like it was always there (same key order, same
// verts-inline-per-part formatting, same trailing comma style), not like
// generated code.
//
// The parts:[...] body here is EditorState.toText() itself, re-indented —
// not a second, independently-maintained serializer. toText() already
// produces exactly what belongs inside parts: [ ... ] (see its own header
// comment), which is the whole point of that format: what's on screen in
// the text pane is what pastes into an element file, with no reshaping in
// between. Save only adds the surrounding variant boilerplate (sku/label/
// passthrough fields) toText() intentionally doesn't know about.
//
// IMPORTANT SCOPE NOTE: this editor cannot read or rewrite the actual
// js/elements/*.js file on disk — the project deliberately runs from
// file:// with no server (see README/project conventions), and browsers
// block fetch() of local files under file://, so there is no way to load
// the original file's exact surrounding text (comments, other variants'
// untouched formatting) to splice a change into. Output is therefore just
// the ONE variant's replacement block, generated fresh from the in-memory
// geometry — the person pastes this over the matching variant in the real
// file by hand, same manual-replace workflow the old geometry editor's
// own saveElementFile() already used (it rebuilt every variant from
// objects it held in memory too, for exactly this reason — not a step
// backward from it).
// ============================================================================
import { EditorState } from './editor-state.js';

export const Save = (() => {

  // Re-indents EditorState.toText()'s 2-space-indented lines to the
  // 6-space depth parts:[...] sits at inside a variant block, and drops
  // the surrounding '[' / ']' lines (the variant snippet supplies its own
  // parts: [ ... ] wrapper).
  function partsBodyText(){
    const lines = EditorState.toText().split('\n');
    return lines.slice(1, -1).map(l => '    ' + l).join('\n');
  }

  function serializePassthrough(passthrough){
    // cableNode (currently the only field this applies to in the live
    // project) is itself a small plain object ({x,y,dir:{x,y}}) — safe to
    // dump with JSON.stringify's key order here since it was only ever
    // produced by JSON.parse-compatible literals to begin with; anything
    // an element author adds later that ISN'T JSON-safe (a function, for
    // instance) would need hand-fixing after paste, same as any generated
    // code would.
    return Object.entries(passthrough).map(([k, v]) => `      ${k}: ${JSON.stringify(v)},`).join('\n');
  }

  function repeatableVariantSnippet(meta){
    const partsLines = partsBodyText();
    const passthroughLines = serializePassthrough(meta.passthrough);
    return `    ${meta.variantKey}: {
      sku: ${JSON.stringify(meta.sku)},
      label: ${JSON.stringify(meta.label)},
      parts: [
${partsLines}
      ],
${passthroughLines ? passthroughLines + '\n' : ''}    },`;
  }

  function buildSnippet(){
    const meta = EditorState.getMeta();
    if (!meta.elementId) {
      // Blank/scratch geometry with no source element attached — just the
      // parts[] array on its own, for pasting into a brand NEW element's
      // variants block (see README "как добавить новый элемент").
      return partsBodyText();
    }
    return repeatableVariantSnippet(meta);
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
    const snippet = buildSnippet();
    const header = meta.elementId
      ? `// Замените вариант "${meta.variantKey}" внутри variants: { ... } в js/elements/${sourceFileGuess(meta.elementId)}.js этим блоком:\n\n`
      : `// Новый элемент — вставьте это как содержимое parts: [ ... ] нужного варианта:\n\n`;
    downloadFile(header + snippet + '\n', (meta.elementId || 'new-element') + '.' + (meta.variantKey || 'variant') + '.snippet.js');
  }

  // Best-effort filename guess purely for the person's convenience in the
  // header comment above — not load-bearing (they know their own project
  // layout), just saves a lookup for the common cases.
  function sourceFileGuess(elementId){
    const map = {
      pult: 'pult', wirelessCharger: 'wireless-charger', outletBlock: 'outlet-block',
      phoneStand: 'phone-stand', tray: 'tray', pullout: 'pullout',
      usbCharger: 'usb-charger', cablePocket: 'cable-pocket', underframe: 'underframe',
    };
    return map[elementId] || elementId;
  }

  return { buildSnippet, save };
})();
