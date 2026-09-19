// ============================================================================
// packages/elements — barrel import for "every element this app offers".
//
// Every file here registers itself into Elements' own registry (see
// core/elements.js) as a SIDE EFFECT of being imported — a bare
// `Elements.register(...)` or `registerSimpleEmbeddable(...)` call at
// module scope, not inside any exported function. That means simply
// importing this barrel (even with no named imports actually used) is
// what makes Drawing.build see these elements at all.
//
// An app that wants every element (the engineer app, today) imports this
// whole barrel. A future app that only offers a SUBSET of elements (e.g.
// a simplified client catalog) should import only the specific element
// files it wants directly — e.g. `import '@elements/wireless-charger.js'`
// — rather than this barrel, since importing this file registers
// everything unconditionally. tabletop.js (the outline) and hole.js (the
// shared mounting-hole geometry several others depend on) are effectively
// mandatory for any project that resembles today's — no such thing as a
// tabletop-less desk — so a curated subset would still want those two.
//
// Order matters only in that a file using another element's exported
// constant (e.g. cable-channels.js importing WIRELESS_CHARGER_VARIANTS
// from wireless-charger.js) pulls that dependency in via its own `import`
// statement regardless of the order listed here — ES module loading
// resolves the whole dependency graph before running any top-level code,
// so there's no manual ordering to maintain the way the old <script>-tag
// list required.
// ============================================================================
import './hole.js';
import './tabletop.js';
import './underframe.js';
import './pult.js';
import './wireless-charger.js';
import './outlet-block.js';
import './phone-stand.js';
import './tray.js';
import './pullout.js';
import './usb-charger.js';
import './cable-pocket.js';
import './cable-channels.js';
