// ============================================================================
// Elements — the plugin contract for anything that contributes geometry to
// the drawing: the tabletop outline itself, the underframe, every
// embeddable element (chargers, trays, cable pockets, etc. — most
// registered via registerSimpleEmbeddable below), and the cable-channel
// router. Each element is a plain object:
//   {
//     id: 'tabletopOutline',
//     buildContours(params) -> [{ contour: [{x,y,bulge},...], layer: 'OUTLINE' }]
//   }
// buildContours receives the full params object and returns a list of
// (contour, layer) pairs. Multiple contours let one element draw several
// disconnected shapes (e.g. an embeddable element's own mounting holes on
// one layer alongside its main cutout on another). Positioning helpers
// below let an element resolve "20mm from the left edge" / "centered" /
// "10mm in from the top-right corner" against the current tabletop bounds
// without hardcoding tabletop knowledge into every element.
// ============================================================================
const Elements = (() => {
  const registry = [];
  function register(element){ registry.push(element); }
  function all(){ return registry; }

  // Resolves an anchor + offset into an absolute point, given the
  // tabletop's bounding box. `anchor` is one of: 'left','right','top',
  // 'bottom','topLeft','topRight','bottomLeft','bottomRight','center'.
  // `offset` is {x, y} in mm, added after the anchor's base position
  // (positive x = further right, positive y = further up, matching CAD
  // Y-up convention used throughout Geo).
  function resolveAnchor(anchor, offset, bounds){
    const { minX, minY, maxX, maxY } = bounds;
    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
    const base = {
      left:        { x: minX, y: midY },
      right:       { x: maxX, y: midY },
      top:         { x: midX, y: maxY },
      bottom:      { x: midX, y: minY },
      topLeft:     { x: minX, y: maxY },
      topRight:    { x: maxX, y: maxY },
      bottomLeft:  { x: minX, y: minY },
      bottomRight: { x: maxX, y: minY },
      center:      { x: midX, y: midY },
    }[anchor] || { x: midX, y: midY };
    const off = offset || { x: 0, y: 0 };
    return { x: base.x + (off.x || 0), y: base.y + (off.y || 0) };
  }

  // For each anchor, which sign to apply to insetX/insetY so a positive
  // number means "further from that anchor, toward the opposite side" —
  // e.g. inset from topRight always pulls left/down, inset from
  // bottomLeft always pulls right/up. For a corner anchor this is a true
  // inward distance (can't sensibly go negative — the field enforces
  // that). For an edge-center anchor (top/bottom/left/right), the axis
  // running ALONG that edge has no "inward" direction to measure from —
  // there's only a horizontal (or vertical) shift left/right of center —
  // so that axis is marked `directional: false` and allowed to go
  // negative, with the same sign convention (positive = right/down) as a
  // plain coordinate shift rather than an inward distance. Both axes are
  // always shown and always meaningful now; `directional` only changes
  // whether the field allows negative numbers, not whether it's visible.
  const ANCHOR_INSET = {
    topLeft:     { signX: +1, signY: -1, directionalX: true,  directionalY: true  },
    topRight:    { signX: -1, signY: -1, directionalX: true,  directionalY: true  },
    bottomLeft:  { signX: +1, signY: +1, directionalX: true,  directionalY: true  },
    bottomRight: { signX: -1, signY: +1, directionalX: true,  directionalY: true  },
    top:         { signX: +1, signY: -1, directionalX: false, directionalY: true  },
    bottom:      { signX: +1, signY: +1, directionalX: false, directionalY: true  },
    left:        { signX: +1, signY: +1, directionalX: true,  directionalY: false },
    right:       { signX: -1, signY: +1, directionalX: true,  directionalY: false },
    center:      { signX: +1, signY: +1, directionalX: false, directionalY: false },
  };

  // Resolves an anchor + insetX/insetY into an absolute point. For a
  // directional axis (corner-to-corner, or the "inward" axis of an
  // edge-center anchor), insetX/insetY is a plain non-negative distance
  // and the sign flip below makes a bigger number always move further
  // from that anchor. For a non-directional axis (the along-the-edge
  // axis of an edge-center anchor, or either axis of 'center'), the same
  // field is instead a signed left/right (or up/down) shift — positive
  // moves right/down, negative moves left/up — since there's no "inward"
  // direction to measure from a middle point.
  function resolveInset(anchor, insetX, insetY, bounds){
    const sign = ANCHOR_INSET[anchor] || ANCHOR_INSET.center;
    const offset = {
      x: (insetX || 0) * sign.signX,
      y: (insetY || 0) * sign.signY,
    };
    return resolveAnchor(anchor, offset, bounds);
  }

  return { register, all, resolveAnchor, resolveInset, ANCHOR_INSET };
})();

// Resolves one embeddable instance's world placement (center + rotation +
// mirror), the same math registerSimpleEmbeddable's own buildContours uses
// internally to place its geometry — factored out so other code (the cable
// channel element, below) can map an element's own hardcoded local anchor
// point into world space without duplicating this transform.
function resolveEmbeddableWorldTransform(instance, p){
  const bounds = { minX: 0, minY: 0, maxX: p.W, maxY: p.H };
  const center = Elements.resolveInset(instance.anchor, instance.insetX, instance.insetY, bounds);
  return { center, rotation: instance.rotation || 0, mirror: instance.mirror };
}

// Maps a point given in an embeddable instance's own local coordinates
// (the same space its `variants` geometry is authored in) into world
// coordinates, applying that instance's mirror/rotate/translate in the
// same order buildContours applies them to its actual geometry.
function embeddableLocalToWorld(localPt, instance, p){
  const { center, rotation, mirror } = resolveEmbeddableWorldTransform(instance, p);
  const [placed] = Geo.translate(
    Geo.rotate(Geo.mirror([{ x: localPt.x, y: localPt.y, bulge: 0 }], mirror), rotation),
    center.x, center.y
  );
  return { x: placed.x, y: placed.y };
}

// Maps a direction vector given in an embeddable instance's own local
// coordinates into world space — same mirror/rotate as
// embeddableLocalToWorld, but no translation (a direction has no
// position of its own), and re-normalized afterward since mirroring
// followed by rotation preserves length already but floating point
// shouldn't be trusted to keep it exactly 1.
function embeddableLocalDirToWorld(localDir, instance, p){
  const { rotation, mirror } = resolveEmbeddableWorldTransform(instance, p);
  const [rotated] = Geo.rotate(Geo.mirror([{ x: localDir.x, y: localDir.y, bulge: 0 }], mirror), rotation);
  const len = Math.hypot(rotated.x, rotated.y) || 1;
  return { x: rotated.x / len, y: rotated.y / len };
}

// ============================================================================
// registerSimpleEmbeddable — factory for every repeatable embeddable
// element (charger, outlet block, phone stand, tray, pull-out stand, USB
// charger, pult). A list of instances, each placed by anchor+insetX/insetY,
// with the same rotate/mirror transform applied to every one of the
// element's own local-space contours before translating into place.
//
// config:
//   id         — element id, matches the id used elsewhere (e.g. Drawing)
//   paramsKey  — which p.<key> array holds this element's instances
//   variants   — { key: { parts } }. `parts` is an array of
//                { verts, layer } in the element's own local coordinates.
//                The geometry must be authored such that (0,0) is the
//                intended reference point (anchor) for all transformations
//                (rotation, mirror, translation). A single-key `variants` means
//                there's effectively no type choice (only one shape
//                exists) — the UI layer decides whether to show a type
//                selector based on how many keys are present, not this
//                factory.
//   defaultVariant — which variants key new instances default to
//   adjustPosition — optional (worldPos, p, footprint) => worldPos hook
//                for positioning logic that depends on something outside
//                this element's own geometry — currently only the
//                pull-out stand's auto-lift over the tabletop's own ergo-
//                notch needs this; every other element leaves it unset.
//   resolveInsets — optional (instance, p) => {insetX, insetY} hook for
//                elements whose inset values need something other than a
//                direct pass-through of instance.insetX/insetY — the USB
//                charger's own X follows a dynamic default (the
//                underframe's own inset + 220mm) when unset, and its Y is
//                always fixed regardless of what's configured, both
//                handled here rather than baking USB-charger-specific
//                logic into the shared buildContours below.
function registerSimpleEmbeddable({ id, paramsKey, variants, defaultVariant }){
  function buildContours(p){
    const instances = p[paramsKey] || [];
    const entries = [];
    for (const instance of instances){
      const data = variants[instance.type] || variants[defaultVariant];
      if (!data) continue;
      const { center, rotation, mirror } = resolveEmbeddableWorldTransform(instance, p);

      for (const { verts, layer } of data.parts){
        // All transforms (mirror, rotate) are applied relative to (0,0).
        const placed = Geo.translate(Geo.rotate(Geo.mirror(verts, mirror), rotation), center.x, center.y);
        entries.push({ contour: placed, layer });
      }
    }
    return entries;
  }

  // `paramsKey` is exposed on the registered element (not just closed
  // over by buildContours above) so other code that operates on "every
  // simple embeddable element" generically — like Dimensions.build's own
  // per-instance dimensioning below — can discover it via Elements.all()
  // instead of needing its own hardcoded list of every element's params
  // key (the exact kind of manually-kept-in-sync list that's caused
  // elements to be silently skipped before).
  Elements.register({ id, paramsKey, buildContours, VARIANTS: variants });
  return variants;
}
