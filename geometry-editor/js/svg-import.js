// ============================================================================
// SVG import — parses <path>/<circle>/<rect> elements from a dropped SVG
// file into this editor's {x,y,bulge} contour format, converting from
// SVG's Y-DOWN screen space into this app's Y-UP CAD convention (same flip
// + winding-reversal every element in js/elements/*.js documents doing by
// hand when tracing ArtCAM exports — see e.g. wireless-charger.js's own
// comment on this). Ported from the old geometry editor's io.js with the
// same arc-to-bulge math (SVG elliptical arcs only convert exactly when
// rx===ry and there's no rotation, same restriction as before — a
// non-circular arc falls back to bulge 0, i.e. a straight chord, same as
// the old importer; good enough for the traced-circle-heavy source files
// this app actually deals with).
// ============================================================================
function parsePathTokens(d){
  const tokens = [];
  const re = /([MLAZmlaz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let match;
  while ((match = re.exec(d))) {
    if (match[1]) tokens.push({ cmd: match[1] });
    else tokens.push({ num: parseFloat(match[2]) });
  }
  const cmds = [];
  let curCmd = null, nums = [];
  for (const t of tokens) {
    if (t.cmd !== undefined) {
      if (curCmd) cmds.push({ cmd: curCmd, nums });
      curCmd = t.cmd;
      nums = [];
    } else {
      nums.push(t.num);
    }
  }
  if (curCmd) cmds.push({ cmd: curCmd, nums });
  return cmds;
}

function arcCenterAndAngles(x0, y0, rx, ry, largeArc, sweep, x1, y1){
  const r = rx;
  const dx = (x0 - x1) / 2, dy = (y0 - y1) / 2;
  const x1p = dx, y1p = dy;
  const rsq = r * r, x1psq = x1p * x1p, y1psq = y1p * y1p;
  const num = rsq * rsq - rsq * x1psq - rsq * y1psq;
  const denom = rsq * x1psq + rsq * y1psq;
  const coef = denom !== 0 ? Math.sqrt(Math.max(0, num / denom)) : 0;
  const sign = largeArc === sweep ? -1 : 1;
  const cxp = sign * coef * y1p;
  const cyp = -sign * coef * x1p;
  function angle(ux, uy, vx, vy){
    const dot = ux * vx + uy * vy;
    const length = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.max(-1, Math.min(1, dot / length)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  }
  const theta1 = angle(1, 0, (x1p - cxp) / r, (y1p - cyp) / r);
  let dtheta = angle((x1p - cxp) / r, (y1p - cyp) / r, (-x1p - cxp) / r, (-y1p - cyp) / r);
  if (sweep === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
  if (sweep === 1 && dtheta < 0) dtheta += 2 * Math.PI;
  return { theta1, dtheta };
}

function commandsToVerts(cmds){
  const pts = [];
  const bulges = [];
  let cur = null;
  for (const { cmd, nums } of cmds) {
    if (cmd === 'M' || cmd === 'm') {
      cur = { x: nums[0], y: nums[1] };
      pts.push(cur);
    } else if (cmd === 'L' || cmd === 'l') {
      const nxt = { x: nums[0], y: nums[1] };
      bulges.push(0);
      pts.push(nxt);
      cur = nxt;
    } else if (cmd === 'A' || cmd === 'a') {
      const [rx, ry, xrot, largeArc, sweep, x1, y1] = nums;
      let bulge = 0;
      if (Math.abs(rx - ry) < 1e-6 && Math.abs(xrot) < 1e-6) {
        const { dtheta } = arcCenterAndAngles(cur.x, cur.y, rx, ry, largeArc, sweep, x1, y1);
        bulge = Math.tan(dtheta / 4);
      }
      bulges.push(bulge);
      const nxt = { x: x1, y: y1 };
      pts.push(nxt);
      cur = nxt;
    }
  }
  if (pts.length > 1 &&
      Math.abs(pts[pts.length - 1].x - pts[0].x) < 1e-6 &&
      Math.abs(pts[pts.length - 1].y - pts[0].y) < 1e-6) {
    pts.pop();
  }
  const n = Math.min(pts.length, bulges.length);
  const verts = [];
  for (let i = 0; i < n; i++) verts.push({ x: pts[i].x, y: pts[i].y, bulge: bulges[i] });
  return verts;
}

function toCadSpace(verts){
  return verts.map(v => ({ x: v.x, y: -v.y, bulge: v.bulge === 0 ? 0 : -v.bulge }));
}

function importSvgText(svgText){
  try {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Невалидный XML');
    const svgEl = doc.querySelector('svg');

    const allContours = [];
    svgEl.querySelectorAll('path').forEach(p => {
      const d = p.getAttribute('d');
      if (!d) return;
      const cadVerts = toCadSpace(commandsToVerts(parsePathTokens(d)));
      if (cadVerts.length >= 2) allContours.push(cadVerts);
    });
    svgEl.querySelectorAll('circle').forEach(c => {
      const cx = parseFloat(c.getAttribute('cx') || 0);
      const cy = parseFloat(c.getAttribute('cy') || 0);
      const r = parseFloat(c.getAttribute('r') || 0);
      if (r > 0) allContours.push([{ x: cx - r, y: -cy, bulge: 1.0 }, { x: cx + r, y: -cy, bulge: 1.0 }]);
    });
    svgEl.querySelectorAll('rect').forEach(r => {
      const x = parseFloat(r.getAttribute('x') || 0), y = parseFloat(r.getAttribute('y') || 0);
      const w = parseFloat(r.getAttribute('width') || 0), h = parseFloat(r.getAttribute('height') || 0);
      if (w > 0 && h > 0) allContours.push([
        { x, y: -y, bulge: 0 }, { x: x + w, y: -y, bulge: 0 },
        { x: x + w, y: -(y + h), bulge: 0 }, { x, y: -(y + h), bulge: 0 },
      ]);
    });
    if (allContours.length === 0) throw new Error('В SVG не найдено подходящих фигур (path/circle/rect)');

    let minX = Infinity, minY = Infinity;
    allContours.forEach(pts => pts.forEach(p => { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; }));
    const shifted = allContours.map(pts => pts.map(p => ({
      x: parseFloat((p.x - minX).toFixed(4)), y: parseFloat((p.y - minY).toFixed(4)),
      bulge: parseFloat((p.bulge || 0).toFixed(6)),
    })));

    const groups = [{ name: 'imported', layer: 'PHYSICAL', contours: shifted }];
    EditorState.load({ elementId: null, variantKey: null, kind: 'repeatable', sku: '', label: '', groups, passthrough: {} });
    Render.setStatus(`Импортировано: ${shifted.length} контуров. Координаты сдвинуты так, что верхний левый угол = (0,0) — проверьте начало координат инструментом «Установить 0,0».`);
  } catch (e) {
    Render.setStatus('Ошибка импорта SVG: ' + e.message, true);
  }
}
