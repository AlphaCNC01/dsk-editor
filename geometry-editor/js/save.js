// ============================================================================
// Save — turns the current EditorState back into source code matching the
// real project's own hand-written style in js/elements/*.js, so pasting the
// output back in reads like it was always there (same key order, same
// verts-inline-per-part formatting, same trailing comma style), not like
// generated code.
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
const Save = (() => {

  function fmtCoord(n){
    const r = parseFloat((n || 0).toFixed(4));
    return Object.is(r, -0) ? 0 : r;
  }
  function fmtBulge(n){
    const r = parseFloat((n || 0).toFixed(8));
    return Object.is(r, -0) ? 0 : r;
  }
  function vertsToLiteral(verts){
    return '[' + verts.map(v => `{x:${fmtCoord(v.x)},y:${fmtCoord(v.y)},bulge:${fmtBulge(v.bulge)}}`).join(',') + ']';
  }

  // Re-flattens the normalized {groups} model back into parts:[{verts,
  // layer}], one entry per contour, in the same order groups/contours were
  // originally read (Registry.groupsFromParts keeps one group per original
  // part, so groups.flatMap here is the exact inverse of that).
  function groupsToParts(groups){
    return groups.flatMap(g => g.contours.map(verts => ({ verts, layer: g.layer })));
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

  function repeatableVariantSnippet(meta, groups){
    const parts = groupsToParts(groups);
    const partsLines = parts.map(p => `      { verts: ${vertsToLiteral(p.verts)}, layer: '${p.layer}' },`).join('\n');
    const passthroughLines = serializePassthrough(meta.passthrough);
    return `    ${meta.variantKey}: {
      sku: ${JSON.stringify(meta.sku)},
      label: ${JSON.stringify(meta.label)},
      parts: [
${partsLines}
      ],
${passthroughLines ? passthroughLines + '\n' : ''}    },`;
  }

  function underframeVariantSnippet(meta, groups){
    const outline = groups.find(g => g.name === 'frameOutline');
    const holes = groups.find(g => g.name === 'frameHoles');
    const outlineLiteral = '[' + (outline ? outline.contours : []).map(vertsToLiteral).join(',') + ']';
    const holesLiteral = '[' + (holes ? holes.contours : []).map(vertsToLiteral).join(',') + ']';
    // width/height are NOT geometry this editor touches (they're used by
    // buildContours for placement math, not derived from the contours
    // themselves — see underframe.js), so they're read back from
    // passthrough rather than recomputed, and flagged clearly if somehow
    // missing rather than silently writing 0 (which would silently break
    // placement on paste).
    const width = meta.passthrough.width;
    const height = meta.passthrough.height;
    const widthLine = width !== undefined ? width : '/* ЗАПОЛНИТЕ: width отсутствовал в исходных данных */';
    const heightLine = height !== undefined ? height : '/* ЗАПОЛНИТЕ: height отсутствовал в исходных данных */';
    return `    '${meta.variantKey}': {
      sku: ${JSON.stringify(meta.sku)},
      label: ${JSON.stringify(meta.label)},
      width: ${widthLine}, height: ${heightLine},
      frameOutline: ${outlineLiteral},
      frameHoles: ${holesLiteral},
    },`;
  }

  function buildSnippet(){
    const meta = EditorState.getMeta();
    const groups = EditorState.getGroups();
    if (!meta.elementId) {
      // Blank/scratch geometry with no source element attached — just the
      // parts[] array on its own, for pasting into a brand NEW element's
      // variants block (see README "как добавить новый элемент").
      const parts = groupsToParts(groups);
      return parts.map(p => `      { verts: ${vertsToLiteral(p.verts)}, layer: '${p.layer}' },`).join('\n');
    }
    return meta.kind === 'singleton'
      ? underframeVariantSnippet(meta, groups)
      : repeatableVariantSnippet(meta, groups);
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
