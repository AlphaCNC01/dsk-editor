// ============================================================================
// HOW TO ADD A NEW SIMPLE ELEMENT (a charger, pocket, tray, etc. — anything
// placed on the tabletop at an anchor+inset position, optionally with a
// rotation/mirror and a type variant). This is a step-by-step checklist;
// follow it top to bottom and the new element is fully wired everywhere:
// preview, DXF/SVG export, save/load, and (if relevant) cable channels.
//
// STEP 1 — Geometry. Find the "Elements" section further down and add:
//
//   const MY_ELEMENT_VARIANTS = registerSimpleEmbeddable({
//     id: 'myElement',            // internal id, only used for debugging
//     paramsKey: 'myElements',    // <-- THE KEY. Same string used in every
//                                 //     other step below. Pick it once here.
//     defaultVariant: 'standard',
//     variants: {
//       standard: { parts: [
//         { verts: [...bulge-arc vertices, local (0,0)-centered...], layer: 'ELEMENTS' },
//       ] },
//     },
//   });
//
//   `verts` is a list of {x, y, bulge} points in the element's OWN local
//   space — (0,0) is whatever point makes sense as this element's anchor
//   (its own geometric center is the usual choice). `layer` controls both
//   the machining metadata (see the Layers registry) and the preview
//   color — reuse an existing layer name (ELEMENTS, UNDERFRAME, etc.) or
//   add a new one to the Layers registry if this element needs its own
//   depth/color:
//
//     MY_LAYER: { name: 'MY_LAYER', color: 3, style: { stroke: '#4cc97c',
//       fillOpacity: 0.1, strokeWidth: 1.5 }, machining: { side: 'bottom',
//       depth: 5, depthAnchor: 'top', millType: 'pocket' } },
//
//   That single entry is enough — the preview, PNG/SVG export, and DXF
//   export all read color/style straight from this registry, so there's
//   no separate CSS or export style list to also update. `color` is the
//   DXF color index (1=red 2=yellow 3=green 4=cyan 5=blue 6=magenta
//   7=white/black — used by DXF-reading CAD tools, independent of
//   `style.stroke`, which is what THIS app's own preview/export use).
//   `machining` is optional (omit it entirely for a layer that's pure
//   reference and never milled, like DIMENSIONS) — see the comment atop
//   Layers.registry for what each of its fields means.
//
//   If a cable channel should be able to start or end at this element,
//   also add a `cableNode: { x, y, dir: { x, y } }` next to `parts` in the
//   variant that has one — see "Cable channels", below.
//
// STEP 2 — UI + everything else. Find where the other managers are
// created (search for "createEmbeddableManager") and add:
//
//   const myElementMgr = createEmbeddableManager({
//     key: 'myElements',               // <-- SAME string as paramsKey above
//     label: 'Мой элемент',            // shown as the section title + row title
//     defaults: { anchor: 'topRight', insetX: 100, insetY: 100 },
//     // dimensionsDefault: false,     // optional — see below
//   });
//
//   That's it — no HTML to write. `key` + `label` is enough:
//   createEmbeddableManager auto-creates the section (title + list + "add"
//   button) and appends it to the controls panel, in the same order
//   createEmbeddableManager is called — every element in this app works
//   this way, so the panel's visible order is simply the order these
//   calls appear in the code. Move the call to reorder the section.
//
//   Every instance also gets its own "show dimensions" toggle (per row,
//   already built into rowHtml — nothing to add for that). It defaults
//   to ON; pass `dimensionsDefault: false` if new instances of THIS
//   element should start with dimensions off instead (the toggle itself
//   is still there either way, so the person can always turn it back on
//   per instance — this only changes what a freshly added instance
//   starts as, and never touches instances from an already-saved
//   project, which always keep whatever they were saved with).
//
// STEP 3 — Register it. Find `ELEMENT_MANAGERS` (a short array literal,
// search for it) and add one line:
//
//   { key: 'myElements', mgr: myElementMgr },
//
//   That's it — this single array drives resolving instances into
//   drawing params, refreshing UI placeholders, and saving/loading
//   projects, so nothing else needs touching for a plain element.
//
// OPTIONAL — a type selector (multiple variants the person can pick
// between, like the pult's "Стандартный" / "Встраиваемый с USB", or
// cablePocket's "Большая" / "Малая"): add `typeSelector: { label: '...',
// options: [{value,text}, ...] }` to the createEmbeddableManager config,
// and register each option's own geometry under that name in `variants`
// back in Step 1.
//
// If different types want different position defaults too (e.g.
// cablePocket's two sizes default to different corners), add
// `typeDefaults: { typeA: {...}, typeB: {...} }` alongside `defaults` —
// each type's own object can set its own anchor/insetX/insetY (any of
// which can still be plain values or functions of (inst, p), same as
// `defaults` itself), layered on top of the shared `defaults` for that
// type only:
//
//   defaults: { type: 'typeA' },   // shared fields + which type is default
//   typeDefaults: {
//     typeA: { anchor: 'right', insetX: 400, insetY: 100 },
//     typeB: { anchor: 'topRight', insetX: 225, insetY: 200 },
//   },
//
// insetX/insetY keep working exactly like a plain element's own (a live
// placeholder the person's own value overrides) — switching type updates
// the placeholder to the new type's default automatically. `anchor` has
// no placeholder concept in the UI (it's a discrete choice, not a
// number), so it's resolved once instead: when a new instance is
// created, and again whenever the person switches that instance's own
// type — both times using the anchor from that type's own typeDefaults
// entry, so it never shows a stale anchor left over from a different
// type.
//
// OPTIONAL — cable channels: if this element can be a source or target
// for a milled cable channel, give it a `cableNode` (Step 1) and wire the
// actual connection in the `cableChannels` element (search for "Element:
// Cable channels") — either add it as a new nearestPoint target list (for
// a T-slot-style fixed target) or call `routeToNearestTarget` with its
// paramsKey and *_VARIANTS constant (for a "route to the nearest instance
// of another element" connection, same as usbCharger->cablePocket — note
// that when a single element has multiple types like cablePocket, filter
// targetInstances to the right `type` before passing it in, so the
// channel only routes to the matching variant).
//
// That's the whole checklist: one geometry registration, one manager
// call, one registry line. Everything else (resolving params, DXF/SVG
// export, placeholders, project save/load) already loops over whatever's
// in ELEMENT_MANAGERS and Elements' own registry — neither needs to know
// new element keys exist ahead of time.
// ============================================================================
