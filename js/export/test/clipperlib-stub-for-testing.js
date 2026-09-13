// ============================================================================
// Minimal ClipperLib STAND-IN for local Node testing only.
//
// This is NOT a reimplementation of Clipper's own polygon-offsetting
// algorithm (that would defeat the entire point of switching to a real,
// battle-tested library). It implements just enough of the same *shape*
// of API (ClipperOffset/AddPath/Execute, Paths, Clipper.Area, JoinType,
// EndType) for gcode.js's own glue code (scaling, path construction, ring
// extraction, the pocket ring-clearing loop) to run and be checked for
// correctness in Node, using a simple per-segment-normal offset + line
// intersection as the actual offsetting math underneath.
//
// It does NOT carry Clipper's own robustness guarantees (self-
// intersection removal, correct topology on pathological input, etc) --
// only the real ClipperLib, loaded from the CDN in index.html, provides
// those in production. This stand-in exists solely so the *rest* of
// gcode.js (everything around the offset call) can be exercised by the
// existing Node test suite without a live browser.
// ============================================================================
(function(){
  function offsetGroundTruth(pts, dist){
    const n = pts.length;
    const edges = [];
    for (let i = 0; i < n; i++){
      const a = pts[i], b = pts[(i + 1) % n];
      const dx = b.X - a.X, dy = b.Y - a.Y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dy / len, ny = -dx / len;
      edges.push({ ax: a.X + nx * dist, ay: a.Y + ny * dist, bx: b.X + nx * dist, by: b.Y + ny * dist, dx, dy });
    }
    const out = [];
    for (let i = 0; i < n; i++){
      const e1 = edges[(i - 1 + n) % n], e2 = edges[i];
      const d1x = e1.dx, d1y = e1.dy, d2x = e2.dx, d2y = e2.dy;
      const denom = d1x * d2y - d1y * d2x;
      let pt;
      if (Math.abs(denom) < 1e-9) pt = { X: e2.ax, Y: e2.ay };
      else {
        const ex = e2.ax - e1.ax, ey = e2.ay - e1.ay;
        const t = (ex * d2y - ey * d2x) / denom;
        pt = { X: e1.ax + t * d1x, Y: e1.ay + t * d1y };
      }
      out.push({ X: Math.round(pt.X), Y: Math.round(pt.Y) });
    }
    return out;
  }

  function polySignedArea(pts){
    let a = 0;
    for (let i = 0; i < pts.length; i++){
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      a += p1.X * p2.Y - p2.X * p1.Y;
    }
    return a / 2;
  }

  function ClipperOffset(){
    this._path = null;
  }
  ClipperOffset.prototype.AddPath = function(path, joinType, endType){
    this._path = path;
  };
  ClipperOffset.prototype.Execute = function(solution, delta){
    if (!this._path || this._path.length < 3) { solution.length = 0; return; }
    const offset = offsetGroundTruth(this._path, delta);
    // Degenerate/inverted-area guard, matching the real library's own
    // "shape fully consumed" behavior closely enough for glue-code testing.
    if (Math.abs(polySignedArea(offset)) < 1) { solution.length = 0; return; }
    solution.length = 0;
    solution.push(offset);
  };

  function Paths(){ return []; }

  const Clipper = {
    Area: function(path){ return polySignedArea(path); },
  };

  global.ClipperLib = {
    ClipperOffset,
    Paths,
    Clipper,
    JoinType: { jtRound: 'jtRound', jtSquare: 'jtSquare', jtMiter: 'jtMiter' },
    EndType: { etClosedPolygon: 'etClosedPolygon', etClosedLine: 'etClosedLine' },
  };
})();
