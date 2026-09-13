// ============================================================================
// Smoke test for js/export/gcode.js: loads the real core/elements/export
// modules into a vm sandbox (same pattern as js/ui/test/app-history.test.js),
// builds a drawing for a plausible tabletop, and checks the G-code output
// is structurally sane: correct file grouping/naming, CRLF line endings,
// every emitted coordinate finite, safe-Z retracts present, no blank
// lines, no bare motion commands.
//
// gcode.js delegates tool-radius offsetting to ClipperLib (see its own
// file-level comment for why), loaded from a CDN <script> tag in
// index.html at runtime. Since there's no real browser here, this suite
// loads a minimal STAND-IN implementation of the same API surface
// (clipperlib-stub-for-testing.js) built on a simple, independently-
// written offset method -- enough to exercise every line of gcode.js's
// OWN logic (scaling, ring extraction, the pocket-clearing loop,
// G-code emission) but NOT a substitute for testing against the real
// ClipperLib in an actual browser, which is still worth doing before
// trusting production output.
// Run: node js/export/test/gcode-smoke.test.js
// ============================================================================
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadInto(context, relPath){
  const full = path.join(__dirname, '..', '..', '..', relPath);
  const code = fs.readFileSync(full, 'utf8');
  vm.runInContext(code, context, { filename: relPath });
}

class FakeDecimal {
  constructor(v){ this.v = typeof v === 'string' ? parseFloat(v) : v; }
  toDecimalPlaces(n){ const f = Math.pow(10, n); return new FakeDecimal(Math.round(this.v * f) / f); }
  toNumber(){ return this.v; }
}

function makeSandbox(){
  const sandbox = {
    console,
    Decimal: FakeDecimal,
    document: { createElement: () => ({ style: {}, appendChild(){}, removeChild(){}, click(){}, setAttribute(){} }), body: { appendChild(){}, removeChild(){} } },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    Blob: function(parts){ this.text = parts.join(''); },
    setTimeout,
    alert: (msg) => { throw new Error('alert() called: ' + msg); },
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox; // clipperlib-stub-for-testing.js assigns to `global.ClipperLib`
  vm.createContext(sandbox);
  return sandbox;
}

function assert(cond, msg){
  if (!cond) throw new Error('FAILED: ' + msg);
  console.log('ok - ' + msg);
}

function loadStandardModules(ctx){
  loadInto(ctx, 'js/export/test/clipperlib-stub-for-testing.js');
  loadInto(ctx, 'js/core/geo.js');
  loadInto(ctx, 'js/core/layers.js');
  loadInto(ctx, 'js/core/elements.js');
  loadInto(ctx, 'js/core/drawing.js');
  loadInto(ctx, 'js/elements/tabletop.js');
  loadInto(ctx, 'js/elements/hole.js');
  loadInto(ctx, 'js/elements/wireless-charger.js');
  loadInto(ctx, 'js/elements/outlet-block.js');
  loadInto(ctx, 'js/export/gcode.js');
}

// ---- Full drawing smoke test ----
const ctx = makeSandbox();
loadStandardModules(ctx);

const pJson = JSON.stringify({
  W: 700, H: 800, thickness: 40,
  rTop: 5, rBottom: 50, rNotch: 0,
  notchOn: false, notchH: 0, notchBottom: 0, notchTop: 0,
  underframeType: 'none', underframeInsetH: 0, underframeInsetV: 0,
  dimensionsOn: false,
});
vm.runInContext(`var __p = ${pJson};`, ctx);
vm.runInContext('var __entries = Drawing.build(__p);', ctx);
const entries = vm.runInContext('__entries', ctx);
assert(entries.length > 0, 'Drawing.build produced entries');

const files = vm.runInContext(`ExportGCode.buildFiles(__entries, __p, 'DSK-TEST')`, ctx);
assert(files.length > 0, 'buildFiles produced at least one file');

for (const { filename, text } of files){
  assert(/^DSK-TEST-(лиц|тыл) ф\d+х\d+\.tap$/.test(filename), `filename matches convention: ${filename}`);
  assert(text.includes('\r\n'), `${filename} uses CRLF line endings`);
  assert(!text.includes('\r\r'), `${filename} has no doubled CR`);
  assert(text.startsWith('T1M6\r\n'), `${filename} starts with T1M6`);
  assert(text.trim().endsWith('M30'), `${filename} ends with M30`);
  assert(/G0X0\.000Y0\.000S\d+M3/.test(text), `${filename} has spindle-start line`);

  const nums = text.match(/[XYZIJ]-?\d+\.\d+/g) || [];
  assert(nums.length > 0, `${filename} contains coordinate tokens`);
  for (const tok of nums){
    const v = parseFloat(tok.slice(1));
    if (!Number.isFinite(v)) throw new Error('Non-finite coordinate: ' + tok + ' in ' + filename);
  }
  console.log('ok - ' + filename + ' all coordinates finite (' + nums.length + ' tokens)');

  const bareMotionLines = text.split('\r\n').filter(l => /^G[01]$/.test(l));
  assert(bareMotionLines.length === 0, `${filename} has no bare motion commands with no arguments`);
  assert(!/G2|G3/.test(text), `${filename} contains no G2/G3 (ClipperLib-based output is pure G1)`);

  const safeZLines = text.match(/G0Z\d+\.\d+/g) || [];
  assert(safeZLines.length >= 3, `${filename} has multiple safe-Z retracts`);

  const lines = text.split('\r\n').filter((_, idx, arr) => idx < arr.length - 1);
  const blankLines = lines.filter(l => l === '');
  assert(blankLines.length === 0, `${filename} has no blank lines`);
}
console.log('\nAll gcode smoke tests passed.');

// ---- ClipperLib not loaded -> clear error, not a silent wrong result ----
{
  const ctxNoLib = makeSandbox();
  loadInto(ctxNoLib, 'js/core/geo.js');
  loadInto(ctxNoLib, 'js/core/layers.js');
  loadInto(ctxNoLib, 'js/export/gcode.js');
  vm.runInContext(`
    var __entries = [ { contour: [ {x:0,y:0,bulge:0}, {x:100,y:0,bulge:0}, {x:100,y:100,bulge:0}, {x:0,y:100,bulge:0} ], layer: 'OUTLINE' } ];
    var __p = { W: 700, H: 800, thickness: 40 };
  `, ctxNoLib);
  let threw = false;
  try {
    vm.runInContext(`ExportGCode.buildFiles(__entries, __p, 'T')`, ctxNoLib);
  } catch (e) {
    threw = /ClipperLib is not loaded/.test(e.message);
  }
  assert(threw, 'missing ClipperLib produces a clear error instead of silently wrong output');
}

// ---- Ramp-to-lap handoff must land the tool where the "remainder of
// lap" loop expects it, for every ramp length - otherwise a segment
// right after the ramp can silently drop its own endpoint because
// moveLine thinks that axis "didn't change" ----
{
  const ctxRamp = makeSandbox();
  loadStandardModules(ctxRamp);
  vm.runInContext(`
    var __entries = [
      { contour: [ {x:320,y:400,bulge:1}, {x:325,y:400,bulge:1} ], layer: 'HOLE_A' },
    ];
    var __p = { W: 700, H: 800, thickness: 40 };
  `, ctxRamp);
  const rampFiles = vm.runInContext(`ExportGCode.buildFiles(__entries, __p, 'T')`, ctxRamp);
  assert(rampFiles.length === 1, 'ramp regression: a lone hole still produces a file');
  const rampText = rampFiles[0].text;
  const lines = rampText.split('\r\n').filter((_, idx, arr) => idx < arr.length - 1);
  assert(lines.filter(l => l === '').length === 0, 'ramp regression: no blank lines from a mishandled ramp-to-lap handoff');
  console.log('Ramp-to-lap handoff regression check passed.');
}

// ---- 2-vertex circle (this codebase's own full-circle convention, see
// js/elements/hole.js) must not be dropped, and a deep pocket must
// produce multiple concentric clearing rings ----
{
  const ctx3 = makeSandbox();
  loadStandardModules(ctx3);
  vm.runInContext(`
    var __entries = [
      { contour: [ {x:320,y:400,bulge:1}, {x:380,y:400,bulge:1} ], layer: 'WIRELESS_POCKET' },
    ];
    var __p = { W: 700, H: 800, thickness: 40 };
  `, ctx3);
  const files3 = vm.runInContext(`ExportGCode.buildFiles(__entries, __p, 'DSK-CIRC')`, ctx3);
  assert(files3.length === 1, 'a lone circular pocket still produces a file');
  const rapidStarts = (files3[0].text.match(/^G0[XY]/gm) || []).length;
  assert(rapidStarts > 3, `circular pocket produced multiple clearing rings (${rapidStarts} rapid-start lines)`);
  console.log('All circle/pocket regression checks passed.');
}

// ---- Deep pocket clearing on a rounded-rect shape must let a corner's
// fillet fully collapse/shrink smoothly as rings go deeper, without
// getting stuck or blowing up - checked directly against
// ExportGCode.clipperOffset/ringArea, the same functions buildToolpaths'
// own pocket loop calls ----
{
  const ctxDeep = makeSandbox();
  loadStandardModules(ctxDeep);
  vm.runInContext(`
    var __corners = [
      { pt: [-40,-25], r: 8 }, { pt: [40,-25], r: 8 }, { pt: [40,25], r: 8 }, { pt: [-40,25], r: 8 },
    ];
    var __verts = ExportGCode.toMachinePolyline(Geo.roundedPolygon(__corners), 'top', 700);
  `, ctxDeep);
  const ringAreas = vm.runInContext(`
    (function(){
      var areas = [];
      var rings = ExportGCode.clipperOffset(__verts, -4);
      var prevArea = rings.reduce(function(s,r){ return s + ExportGCode.ringArea(r); }, 0);
      areas.push(prevArea);
      for (var i = 0; i < 20 && rings.length > 0; i++){
        var next = rings.reduce(function(acc,r){ return acc.concat(ExportGCode.clipperOffset(r, -3.2)); }, []);
        var nextArea = next.reduce(function(s,r){ return s + ExportGCode.ringArea(r); }, 0);
        if (next.length === 0 || nextArea < 1e-3 || nextArea >= prevArea) break;
        areas.push(nextArea);
        rings = next;
        prevArea = nextArea;
      }
      return areas;
    })();
  `, ctxDeep);
  assert(ringAreas.length >= 3, `pocket clearing produced multiple rings before stopping (${ringAreas.length})`);
  assert(ringAreas.every(Number.isFinite), 'every pocket ring has a finite area');
  assert(ringAreas.every(a => a > 0), 'every pocket ring has a positive area');
  for (let i = 1; i < ringAreas.length; i++){
    assert(ringAreas[i] < ringAreas[i - 1], `ring ${i} area (${ringAreas[i].toFixed(1)}) is smaller than ring ${i - 1} (${ringAreas[i - 1].toFixed(1)}) - no stuck corner blocking further shrinkage`);
  }
  console.log('Deep-pocket corner-degeneracy regression check passed.');
}

// ---- The wireless-charger pocket (the exact shape reported as broken:
// alternating ~41mm and ~16mm-radius arcs meeting at real corners) must
// at least produce a well-formed, finite ring through the real gcode.js
// pipeline (toMachinePolyline -> buildToolpaths). NOTE: this test's own
// ClipperLib stand-in (clipperlib-stub-for-testing.js) uses a simple
// per-segment-normal-offset method with NO self-intersection cleanup --
// exactly the class of naive offsetting that broke on this very shape
// during earlier attempts at hand-rolling the offset math -- so it
// cannot by itself prove the real ClipperLib (which DOES do proper
// self-intersection cleanup, the whole reason it replaced the hand-
// rolled code) handles this shape well. What this test DOES verify is
// gcode.js's own glue code around the offset call: the pipeline runs
// end-to-end without throwing, returns a well-formed non-empty ring,
// and every coordinate is finite. Confirming the actual cut quality on
// this shape requires running the real CDN-loaded ClipperLib in an
// actual browser (or Node with the real package installed) -- the
// stand-in's own known limitation is not a reason to skip that check.
{
  const ctxHex = makeSandbox();
  loadStandardModules(ctxHex);
  vm.runInContext(`
    // The real WIRELESS_POCKET part, verbatim from js/elements/wireless-charger.js.
    var __pocket = [
      {x:-0.0,y:53.1095,bulge:0.40227135},{x:-15.9857,y:37.7647,bulge:0.66241657},
      {x:-15.9859,y:-37.7653,bulge:0.40225204},{x:-0.0005,y:-53.1095,bulge:0.40225206},
      {x:15.9863,y:-37.7667,bulge:0.66240831},{x:15.9863,y:37.7654,bulge:0.40227133}
    ];
    var __normalized = ExportGCode.toMachinePolyline(__pocket, 'bottom', 700);
    var __rings = ExportGCode.buildToolpaths(__normalized, 'pocket', 4, 3.2);
  `, ctxHex);
  const rings = vm.runInContext('__rings', ctxHex);
  assert(rings.length > 0, 'wireless-charger pocket produced at least one clearing ring');
  const firstRingArea = vm.runInContext('ExportGCode.ringArea(__rings[0])', ctxHex);
  assert(Number.isFinite(firstRingArea) && firstRingArea > 0, 'first ring has a finite, positive area');
  const firstRingPts = vm.runInContext('__rings[0]', ctxHex);
  assert(firstRingPts.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'first ring has only finite coordinates');
  console.log('Wireless-charger pocket pipeline check passed (see comment: does not by itself validate real ClipperLib cut quality).');
}

console.log('\nAll tests passed.');
