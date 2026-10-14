// ============================================================================
// Element: Cable channels (-). Optional, per-instance grooves
// milled from a hardcoded node on one embeddable element (wirelessCharger,
// usbCharger, pult) to a target the user explicitly PICKS via that
// source's own `cableTarget` field  one of:
//   - 'none'                 no channel (default)
//   - 'tslot:<n>'             the n-th (0-based, counting only among
//     'tslot'-type topNotches instances, in list order) T-slot notch's
//     own two base-arm entry points (whichever, left/right, is closer to
//     the source  see tSlotEntryPoints), on CABLE_CHANNEL_4 (4x4mm)
//   - 'smallPocket:<n>'       the n-th (0-based, in creation order) small
//     cablePocket instance, on CABLE_CHANNEL_5_5 (5.5x5.5mm)
//   - 'bigPocket:<n>'         the n-th big cablePocket instance, on
//     CABLE_CHANNEL_5_5 (5.5x5.5mm)
// The same target vocabulary is offered to every source  there's no
// per-element restriction on which target types it may pick (any source
// can aim at the T-slot or at any pocket, big or small). The channel's
// own WIDTH, however, is fixed per SOURCE element, not per target: the
// wireless charger AND the (end-mounted/"") USB charger both cut
// a 4x4mm channel (CABLE_CHANNEL_4) regardless of what they're aimed at,
// while the pult's channel is always 5.5x5.5mm (CABLE_CHANNEL_5_5)  see
// buildContours' own three routeToChosenTarget calls below, one per
// source, each with its own hardcoded width/layer.
// target no longer exists (its index is out of range for the current
// project  pocket deleted, or its type changed), that source's channel
// is simply skipped rather than silently falling back to some other
// target: the person picked a specific target, so a channel to a
// DIFFERENT target would be a silent surprise, not a reasonable default.
//
// Every cableNode (on both the source element and the target
// cutout/pocket) carries its own local exit direction (`dir`, one of the
// 4 axis directions in that element's own local space  rotates/mirrors
// along with the element itself, same as the point). The path is built
// as: a fixed 50mm straight "stub" leaving the source along its own
// direction, a fixed 50mm straight stub leaving the target along its own
// direction, and a middle run connecting the two stub ends using only
// horizontal, vertical, and 45-diagonal segments (never an arbitrary
// angle)  picked as the shortest of a handful of simple candidate
// routes (axis-then-axis, or axis-then-diagonal-then-axis) rather than a
// full pathfinding search, since with only two stub ends to connect, a
// handful of candidates already covers every qualitatively different
// route. Every interior joint (including where a stub meets the middle
// run) is rounded, with radius the largest that fits the shortest
// segment on either side of that joint, up to a 50mm cap.
// The path construction itself (stubs, diagonal run, jogs, fallbacks) lives
// in js/core/routing.js (Routing.channelContour); this file only picks the
// source/target nodes and registers the element.
// ============================================================================
Elements.register((() => {
  function nearestPoint(from, candidates){
    let best = null, bestD = Infinity;
    for (const c of candidates){
      const d = Geo.dist([from.x, from.y], [c.x, c.y]);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  // Resolves every instance of a registerSimpleEmbeddable-style element
  // into a flat list of world-space cableNodes ({x,y,dir}), skipping any
  // instance/variant that has no cableNode of its own. Order matches
  // `instances`'s own order, which is what `cableTarget`'s "<n>" index
  // (see resolveCableTarget) counts against.
  function worldNodes(instances, variantsById, p){
    return (instances || [])
      .map(instance => {
        const variant = variantsById[instance.type] || variantsById.standard;
        if (!variant || !variant.cableNode) return null;
        const pt = embeddableLocalToWorld(variant.cableNode, instance, p);
        const dir = embeddableLocalDirToWorld(variant.cableNode.dir, instance, p);
        return { x: pt.x, y: pt.y, dir };
      })
      .filter(Boolean);
  }

  // Resolves a source's own `cableTarget` string into a concrete
  // world-space target point ({x,y,dir}), given the source's own already-
  // resolved world point (needed only to pick the closer of the T-slot's
  // two entry points  see tSlotEntryPoints). Returns null if the target
  // doesn't exist (no T-slot configured, or the referenced pocket index
  // is out of range for the CURRENT project)  the caller skips the
  // channel entirely in that case, exactly like an unset/'none' target.
  function resolveCableTarget(cableTarget, source, p){
    if (!cableTarget || cableTarget === 'none') return null;
    // 'tslot:<n>' — the n-th T-slot notch (0-based, counting only among
    // topNotches entries of type 'tslot' — see allTSlotEntryPoints in
    // tabletop.js and its matching updateCableTargetOptions counter in
    // field-helpers.js). Whichever of that notch's own two base-arm entry
    // points (left/right) is closer to the source is picked, same as the
    // old single-T-slot behavior.
    const tSlotMatch = /^tslot:(\d+)$/.exec(cableTarget);
    if (tSlotMatch) {
      const idx = parseInt(tSlotMatch[1], 10);
      const tSlot = allTSlotEntryPoints(p)[idx];
      if (!tSlot) return null;
      return nearestPoint(source, [tSlot.left, tSlot.right]);
    }
    const pocketMatch = /^(small|big)Pocket:(\d+)$/.exec(cableTarget);
    if (pocketMatch) {
      const [, size, idxStr] = pocketMatch;
      const idx = parseInt(idxStr, 10);
      const pockets = (p.cablePockets || []).filter(i => i.type === size);
      const nodes = worldNodes(pockets, CABLE_POCKET_VARIANTS, p);
      return nodes[idx] || null;
    }
    return null;
  }

  // Routes every instance of one source element to whatever target its
  // own `cableTarget` field names (see resolveCableTarget)  shared by
  // all three source elements below, since none of them differ in how
  // a target is picked once the person has chosen one explicitly.
  // `width`/`layer` are fixed per SOURCE element (not per target), same
  // as before: a wireless charger's channel is always 4x4mm regardless
  // of which target it's aimed at, and usbCharger/pult channels are
  // always 5.5x5.5mm.
  function routeToChosenTarget(sourceInstances, sourceVariantsById, width, layer, p, entries){
    for (const instance of (sourceInstances || [])){
      if (!instance.cableTarget || instance.cableTarget === 'none') continue;
      const variant = sourceVariantsById[instance.type] || sourceVariantsById.standard;
      if (!variant || !variant.cableNode) continue;
      const sourcePt = embeddableLocalToWorld(variant.cableNode, instance, p);
      const sourceDir = embeddableLocalDirToWorld(variant.cableNode.dir, instance, p);
      const source = { x: sourcePt.x, y: sourcePt.y, dir: sourceDir };
      const target = resolveCableTarget(instance.cableTarget, source, p);
      if (!target) continue; // chosen target no longer exists  skip, don't fall back
      entries.push({ contour: Routing.channelContour(source, target, width), layer });
    }
  }

  function buildContours(p){
    const entries = [];
    routeToChosenTarget(p.chargers, WIRELESS_CHARGER_VARIANTS, 4, 'CABLE_CHANNEL_4', p, entries);
    routeToChosenTarget(p.usbChargers, USB_CHARGER_VARIANTS, 4, 'CABLE_CHANNEL_4', p, entries);
    routeToChosenTarget(p.pults, PULT_VARIANTS, 5.5, 'CABLE_CHANNEL_5_5', p, entries);
    return entries;
  }

  return { id: 'cableChannels', buildContours };
})());
