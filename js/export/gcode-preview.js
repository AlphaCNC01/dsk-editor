// ============================================================================
// GCodePreview — what the editor shows about the G-code before it is
// exported: a toolpath overlay for the SVG preview, a machining-time
// estimate per program, and warnings (a cut leaving the stock, Z below the
// table, a tool that does not fit its contour). It reads the very same
// programs the exporter writes (ExportGCode.buildPrograms), so the picture
// and the files cannot disagree. Pure analysis: never changes the output.
// ============================================================================
const GCodePreview = (() => {

  // Rapid (G0) travel speed used for the time estimate, mm/min. A guess:
  // set it to the machine's real rapid rate for a closer number.
  const RAPID_FEED = 15000;
  // Colour of the overlay per tool diameter.
  const TOOL_COLORS = { 4: '#d6336c', 8: '#1c7ed6' };

  // Visits every move with its start and end point (x, y, z) and the feed
  // in force; `visit(m, a, b, feed, arc)` — arc is { cx, cy, r, sweep }
  // (signed, radians; positive = counter-clockwise) for G2/G3.
  function walk(program, visit){
    let pos = { x: 0, y: 0, z: program.safeZ };
    let feed = program.tool.feed;
    for (const m of program.moves){
      const end = {
        x: m.x !== undefined ? m.x : pos.x,
        y: m.y !== undefined ? m.y : pos.y,
        z: m.z !== undefined ? m.z : pos.z,
      };
      if (m.t === 'line' && m.f !== undefined) feed = m.f;
      let arc = null;
      if (m.t === 'arc') {
        const cx = pos.x + m.i, cy = pos.y + m.j;
        const r = Math.hypot(pos.x - cx, pos.y - cy);
        let sweep = Math.atan2(end.y - cy, end.x - cx) - Math.atan2(pos.y - cy, pos.x - cx);
        if (m.cw) { while (sweep >= 0) sweep -= 2 * Math.PI; } else { while (sweep <= 0) sweep += 2 * Math.PI; }
        arc = { cx, cy, r, sweep };
      }
      visit(m, pos, end, feed, arc);
      pos = end;
    }
  }

  function moveLength(a, b, arc){
    const dz = b.z - a.z;
    const flat = arc ? Math.abs(arc.sweep) * arc.r : Math.hypot(b.x - a.x, b.y - a.y);
    return Math.hypot(flat, dz);
  }

  // Time, lengths and warnings for the programs of one panel.
  function analyze(programs, p, warnings){
    const ext = GCodeToolpath.machineExtent(p.W, p.H);
    const out = { programs: [], totalMinutes: 0, warnings: [...(warnings || [])] };
    for (const program of programs){
      let cutMM = 0, rapidMM = 0, minutes = 0, belowTable = false, outside = false;
      const margin = program.tool.diameter / 2 + 0.5;
      walk(program, (m, a, b, feed, arc) => {
        const len = moveLength(a, b, arc);
        if (m.t === 'rapid') {
          rapidMM += len; minutes += len / RAPID_FEED;
          return;
        }
        cutMM += len; minutes += len / feed;
        if (b.z < -1e-6) belowTable = true;
        if (b.x < -margin || b.y < -margin || b.x > ext.w + margin || b.y > ext.h + margin) outside = true;
      });
      if (belowTable) out.warnings.push(`${program.filename}: рез ниже поверхности стола (Z < 0)`);
      if (outside) out.warnings.push(`${program.filename}: траектория выходит за пределы заготовки`);
      out.programs.push({ filename: program.filename, minutes, cutMM, rapidMM });
      out.totalMinutes += minutes;
    }
    return out;
  }

  // SVG markup (in the editor preview's own coordinates: drawing X, and Y
  // flipped as RenderSVG does) with the cutting moves of every program.
  function overlaySvg(programs, p){
    const fmt = n => (Math.round(n * 10) / 10).toString();
    const parts = [];
    for (const program of programs){
      const toView = (x, y) => {
        const d = GCodeToolpath.fromMachinePoint(x, y, program.side, p.W, p.H);
        return { x: d.x, y: p.H - d.y };
      };
      let d = '';
      let lastKey = null;
      const lineTo = (x, y, move) => {
        const v = toView(x, y);
        const key = fmt(v.x) + ' ' + fmt(v.y);
        if (key === lastKey) return;
        d += (move ? 'M' : 'L') + key;
        lastKey = key;
      };
      let penDown = false;
      walk(program, (m, a, b, feed, arc) => {
        if (m.t === 'rapid') { penDown = false; return; }
        if (!penDown) { lineTo(a.x, a.y, true); penDown = true; }
        if (arc) {
          const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 36)));
          for (let k = 1; k <= n; k++){
            const ang = Math.atan2(a.y - arc.cy, a.x - arc.cx) + arc.sweep * k / n;
            lineTo(arc.cx + arc.r * Math.cos(ang), arc.cy + arc.r * Math.sin(ang), false);
          }
        } else {
          lineTo(b.x, b.y, false);
        }
      });
      if (!d) continue;
      const color = TOOL_COLORS[program.tool.diameter] || '#2b8a3e';
      parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="1" stroke-opacity="0.75" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`);
    }
    return `<g id="gcodeOverlay" pointer-events="none">${parts.join('')}</g>`;
  }

  return { analyze, overlaySvg, RAPID_FEED, TOOL_COLORS };
})();
