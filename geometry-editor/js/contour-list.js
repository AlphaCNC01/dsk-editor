// ============================================================================
// ContourList — left-pane list of every group/contour in the current
// geometry, mirroring the text pane and preview rather than replacing
// either: selecting here highlights the same contour in the SVG preview,
// and vice versa (see main.js's EditorState.onChange wiring). Existing for
// two things the text pane alone is bad at: seeing the whole shape's
// structure at a glance (how many holes does this variant have, on which
// layers), and deleting one contour without hand-editing JSON brackets.
// ============================================================================
const ContourList = (() => {
  let listEl, layerSelectEl, countEl;

  function init(refs){
    listEl = refs.list;
    layerSelectEl = refs.newContourLayer;
    countEl = document.getElementById('contourCount');
    populateLayerOptions();
  }

  function populateLayerOptions(){
    layerSelectEl.innerHTML = Layers.all()
      .map(l => `<option value="${l.name}">${l.name}</option>`)
      .join('');
  }

  function render(){
    const groups = EditorState.getGroups();
    const sel = EditorState.getSelection();
    listEl.innerHTML = '';
    let total = 0;

    groups.forEach((group, gi) => {
      group.contours.forEach((contour, ci) => {
        total++;
        const row = document.createElement('div');
        row.className = 'contour-item' + (sel && sel.groupIndex === gi && sel.contourIndex === ci ? ' selected' : '');

        const swatch = document.createElement('div');
        swatch.className = 'swatch';
        swatch.style.background = Render.layerColor(group.layer);
        row.appendChild(swatch);

        const meta = document.createElement('div');
        meta.className = 'meta';
        const vertCount = contour.length;
        meta.innerHTML = `<b>${group.name}</b>${group.contours.length > 1 ? ` #${ci + 1}` : ''}<br><span class="layer-name">${group.layer} · ${vertCount} т.</span>`;
        row.appendChild(meta);

        const del = document.createElement('button');
        del.className = 'del';
        del.textContent = '✕';
        del.title = 'Удалить контур';
        del.addEventListener('click', (ev) => {
          ev.stopPropagation();
          deleteContour(gi, ci);
        });
        row.appendChild(del);

        row.addEventListener('click', () => {
          EditorState.setSelection({ groupIndex: gi, contourIndex: ci });
        });

        listEl.appendChild(row);
      });
    });
    if (countEl) countEl.textContent = `(${total})`;
  }

  function deleteContour(gi, ci){
    const groups = EditorState.getGroups();
    const group = groups[gi];
    if (!group) return;
    if (group.contours.length <= 1) {
      if (!confirm(`Это последний контур в группе "${group.name}". Удалить всю группу?`)) return;
      groups.splice(gi, 1);
    } else {
      group.contours.splice(ci, 1);
    }
    EditorState.setGroups(groups, { select: null });
  }

  function addContour(){
    const layer = layerSelectEl.value;
    const groups = EditorState.getGroups();
    // A new contour joins an existing group on the same layer if one
    // exists (keeps the JSON tidy — one group per layer is the common
    // case for hand-authored new elements), otherwise starts a new group.
    let group = groups.find(g => g.layer === layer);
    const blank = [
      { x: 0, y: 0, bulge: 0 }, { x: 20, y: 0, bulge: 0 },
      { x: 20, y: 20, bulge: 0 }, { x: 0, y: 20, bulge: 0 },
    ];
    let gi;
    if (group) {
      gi = groups.indexOf(group);
      group.contours.push(blank);
    } else {
      groups.push({ name: `part ${groups.length + 1}`, layer, contours: [blank] });
      gi = groups.length - 1;
      group = groups[gi];
    }
    EditorState.setGroups(groups, { select: { groupIndex: gi, contourIndex: group.contours.length - 1 } });
  }

  return { init, render, addContour };
})();
