// ============================================================================
// GCodePost — post-processor: turns the abstract move list built by
// gcode-toolpath.js into the text of one program for the shop's controller
// (NCStudio, CRLF line endings, .tap/.nc). This is the ONLY place that
// knows the output dialect: header/footer, number formatting, "only
// changed axes" output and the modal G-code rule. Supporting another
// controller means writing another post with the same render() contract.
//
// Dialect rules, taken from the shop's own reference programs:
//   - G0 is always written out; G1/G2/G3 are modal — the code word is
//     written only when it differs from the previous cutting move, or
//     when the move carries a feed (F).
//   - Axes that did not change since the last move are omitted.
//   - Numbers have 3 decimals; feed is written as "F<value>.0".
//   - Arc centres are written as I/J (offset from the arc's start point).
// ============================================================================
const GCodePost = (() => {

  const DEC = 3; // matches the shop's own reference files' own precision
  function fmt(n){ return Geo.cleanRound(n, DEC).toFixed(DEC); }

  // Formats one move's axis words, omitting any axis that has not changed
  // since the last emitted point. `state` tracks the last emitted value
  // per axis across the whole file (raw values, compared with a 1e-6
  // tolerance).
  function axisWords(m, state){
    let s = '';
    if (m.x !== undefined && (state.x === null || Math.abs(m.x - state.x) > 1e-6)) { s += 'X' + fmt(m.x); state.x = m.x; }
    if (m.y !== undefined && (state.y === null || Math.abs(m.y - state.y) > 1e-6)) { s += 'Y' + fmt(m.y); state.y = m.y; }
    if (m.z !== undefined && (state.z === null || Math.abs(m.z - state.z) > 1e-6)) { s += 'Z' + fmt(m.z); state.z = m.z; }
    return s;
  }

  // program = { rpm, safeZ, moves: Move[] } (Move shapes: see
  // gcode-toolpath.js). Returns the full program text.
  function render(program){
    const { rpm, safeZ, moves } = program;
    const state = { x: null, y: null, z: null };
    let mode = null; // last modal motion word (G1/G2/G3); null after G0
    const lines = [];

    lines.push('T1M6');
    lines.push('G0Z' + fmt(safeZ));
    lines.push('G0X' + fmt(0) + 'Y' + fmt(0) + 'S' + rpm + 'M3');
    state.x = 0; state.y = 0;

    for (const m of moves){
      if (m.t === 'rapid') {
        lines.push('G0' + axisWords(m, state));
        mode = null;
        continue;
      }
      const code = m.t === 'line' ? 'G1' : (m.cw ? 'G2' : 'G3');
      let words = axisWords(m, state);
      if (m.t === 'arc') words += 'I' + fmt(m.i) + 'J' + fmt(m.j);
      if (m.f !== undefined) words += 'F' + m.f.toFixed(1);
      if (!words) continue; // degenerate move (duplicate vertex): nothing to say
      // A move that carries a feed always names its code word too (the
      // reference programs write feed-only lines as "G1F4000.0").
      lines.push((code === mode && m.f === undefined ? '' : code) + words);
      mode = code;
    }

    lines.push('G0Z' + fmt(safeZ));
    lines.push('G0X' + fmt(0) + 'Y' + fmt(0));
    lines.push('G0Z' + fmt(safeZ));
    lines.push('G0X0Y0');
    lines.push('M30');
    return lines.join('\r\n') + '\r\n';
  }

  return { render, fmt };
})();
