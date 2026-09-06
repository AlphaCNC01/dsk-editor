// ============================================================================
// Layers — the DXF layer registry. Every contour produced by an element
// declares which layer it belongs to; DXF export groups entities by layer
// and emits a proper LAYER table so the names/colors show up in any CAD
// tool's layer manager. Declared here even for layers nothing draws on yet,
// so the drawing is ready to receive future elements (underframe holes,
// insert cutouts, dimension lines) without touching the export code again.
// ============================================================================
const Layers = (() => {
  // DXF color index: 1=red 2=yellow 3=green 4=cyan 5=blue 6=magenta 7=white/black
  //
  // `style` is the ONE place a layer's visual appearance is defined —
  // both the live on-screen preview and the exported SVG/PNG read from
  // it directly (see RenderSVG/Export.SVG below), so adding a layer here
  // with a `style` is enough to make it show up correctly everywhere;
  // no separate CSS class or export style list to keep in sync.
  //   stroke      — hex color for the outline
  //   fillOpacity — 0 for an unfilled/open shape (most reference lines),
  //                 otherwise how solid the layer's own fill reads —
  //                 lower for a layer that's mostly about its outline,
  //                 higher for one where the filled area itself is what
  //                 matters (e.g. a pocket you're milling out)
  //   strokeWidth — line thickness in the drawing's own mm units
  //   dashed      — true for a dashed outline (used to visually
  //                 distinguish layers that would otherwise look similar
  //                 in color/fill, like the two cable-channel widths)
  //
  // machining describes how a layer's contours should be cut, for anyone
  // reading the DXF on a CNC — not read or used by any geometry/export
  // code here (the DXF's own numbers stay the same regardless), it's
  // metadata the operator uses to set up the machine:
  //   side       — which face of the material to cut from: 'top' or
  //                'bottom' ('bottom' by default — most of this app's own
  //                geometry is drawn from the underside)
  //   depth      — cut depth in mm, or 'none' if this layer isn't milled
  //                at all (a schematic/reference layer)
  //   depthAnchor— what the depth is measured from: 'top' (from the
  //                material's top face), 'bottom' (from the face named in
  //                `side`), or 'center' (from the material's mid-plane,
  //                where the final depth is thickness/2 + depth). E.g.
  //                side='bottom', depth=5, depthAnchor='bottom' means "mill
  //                5mm deep, starting from the bottom face"; side='bottom',
  //                depth=0, depthAnchor='top' means "cut all the way
  //                through" (the bottom-side cut reaches the top face).
  //   millType   — 'pocket' (clear the whole enclosed area, e.g. a
  //                recess) or one of three contour-following modes,
  //                which only differ in how the cutter's own radius is
  //                compensated for a closed path (irrelevant for pockets
  //                and for open/reference lines):
  //                  'contour' — cut exactly along the path itself,
  //                              splitting the kerf between the two
  //                              sides (used when the exact line matters
  //                              more than which side stays which size)
  //                  'outside' — offset the toolpath outward, so the
  //                              piece inside the path ends up at its
  //                              full nominal size (e.g. the tabletop's
  //                              own silhouette — the panel itself must
  //                              come out true to size)
  //                  'inside'  — offset the toolpath inward, so the
  //                              opening inside the path ends up at its
  //                              full nominal size (e.g. a cutout whose
  //                              hole needs to fit an insert)
  //                'contour' by default. These cutter-compensation
  //                settings aren't dialed in yet (values above are
  //                placeholders) — to be configured later.
  // DIMENSIONS has no `machining` — it's pure on-screen/on-paper
  // reference, never actually cut.
  const registry = {
  // tabletop silhouette
  OUTLINE: { name: 'OUTLINE', color: 7,
    style: { stroke: '#ff8a3d', fillOpacity: 0, strokeWidth: 2 },
    machining: { side: 'bottom', depth: 0, depthAnchor: 'top', millType: 'outside' } },

  // tabletop cutouts
  CUTOUT: { name: 'CUTOUT', color: 7,
    style: { stroke: '#ff8a3d', fillOpacity: 0 },
    machining: { side: 'bottom', depth: 0, depthAnchor: 'top', millType: 'inside' } },

  // physical parts that is not part of a tabletop, for reference
  PHYSICAL: { name: 'PHYSICAL', color: 8,
    style: { stroke: '#808080', fillOpacity: 0 } },

  // outlet block's own visible top face (the physical unit sits on top
  // of the panel here, unlike PHYSICAL above which is a shared reference
  // outline for several unrelated elements) — kept separate so the wood-
  // texture preview can fill just this one shape as a solid cover plate
  // (eventually a real product photo) without affecting PHYSICAL's own
  // reference-only rendering everywhere else it's used.
  OUTLET_BLOCK_TOP: { name: 'OUTLET_BLOCK_TOP', color: 8,
    style: { stroke: '#808080', fillOpacity: 0 } },

  // mounting holes
  HOLES: { name: 'HOLES', color: 6,
    style: { stroke: '#b06fe0', fillOpacity: 0 },
    machining: { side: 'bottom', depth: 'none', depthAnchor: 'bottom', millType: 'contour' } },

  ENGRAVING: { name: 'ENGRAVING', color: 3,
    style: { stroke: '#4cc97c', fillOpacity: 0 },
    machining: { side: 'top', depth: 0.5, depthAnchor: 'top', millType: 'pocket' } },

  PHONESTAND: { name: 'PHONESTAND', color: 3,
    style: { stroke: '#4cc97c', fillOpacity: 0 },
    machining: { side: 'top', depth: 11, depthAnchor: 'top', millType: 'pocket' } },

  WIRELESS_POCKET: { name: 'WIRELESS_POCKET',  color: 4,
    style: { stroke: '#e0a84a', fillOpacity: 0, dashed: true },
    machining: { side: 'bottom', depth: 3, depthAnchor: 'top', millType: 'pocket' } },

  USB_CHARGER_POCKET: { name: 'USB_CHARGER_POCKET', color: 4,
    style: { stroke: '#e0a84a', fillOpacity: 0, dashed: true },
    machining: { side: 'bottom', depth: 3, depthAnchor: 'top', millType: 'pocket' } },

  EMBEDED_USB_POCKET:  { name: 'EMBEDED_USB_POCKET',  color: 4,
    style: { stroke: '#e0a84a', fillOpacity: 0, dashed: true },
    machining: { side: 'bottom', depth: 3, depthAnchor: 'top', millType: 'pocket' } },

   // 4x4mm cable channel groove
  CABLE_CHANNEL_4:  { name: 'CABLE_CHANNEL_4',  color: 4,
    style: { stroke: '#e0a84a', fillOpacity: 0, strokeWidth: 1, dashed: true },
    machining: { side: 'bottom', depth: 4, depthAnchor: 'top', millType: 'pocket' } },

  // 5.5x5.5mm cable channel groove
  CABLE_CHANNEL_5_5:  { name: 'CABLE_CHANNEL_5_5',  color: 4,
    style: { stroke: '#e0a84a', fillOpacity: 0, strokeWidth: 1.5, dashed: true },
    machining: { side: 'bottom', depth: 5.5, depthAnchor: 'top', millType: 'pocket' } },

  CABLE_POCKET: { name: 'CABLE_POCKET', color: 4,
    style: { stroke: '#e0a84a', fillOpacity: 0, strokeWidth: 1.5, dashed: true },
    machining: { side: 'bottom', depth: 5.5, depthAnchor: 'top', millType: 'pocket' } },

  // dimension lines — pure reference, never milled, so no `machining` at all
  DIMENSIONS: { name: 'DIMENSIONS', color: 1,
    style: { stroke: '#e05a5a', fillOpacity: 1, strokeWidth: 1 } },
  };
  const all = () => Object.values(registry);
  // Returns undefined for an id not in the registry — deliberately NOT
  // falling back to OUTLINE (an earlier version did), since silently
  // reassigning unknown-layer geometry to a real layer would hide the
  // mistake instead of surfacing it. Callers that need a display name/
  // color for known-safe cases (e.g. always-valid literal layer names)
  // can still rely on the value being present; anything reading a
  // contour's own `layer` field (element-authored, so typos are possible)
  // must handle the undefined case — see RenderSVG's unknown-layer
  // handling for where that surfaces to the person.
  const get = (id) => registry[id];
  return { registry, all, get };
})();
