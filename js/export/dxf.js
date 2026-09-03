// ============================================================================
// Export.DXF — Drawing -> DXF R12 (AC1009) text. R12 was chosen (over the
// newer LWPOLYLINE-based R2000+) because it only needs HEADER + TABLES +
// ENTITIES with simple name references — no owner-handle bookkeeping — and
// is read by effectively every DXF-capable tool. Each layer gets its own
// POLYLINE per contour, grouped under a proper LAYER table so names/colors
// appear correctly in any CAD layer manager, including layers with no
// geometry yet (reserved for planned features).
// ============================================================================
const ExportDXF = (() => {
  const ARC_SEGMENTS_PER_CIRCLE = 128; // keeps tessellated arcs visually smooth

  function buildLayerTable(add){
    const layers = Layers.all();
    add(0,'SECTION'); add(2,'TABLES');
    add(0,'TABLE'); add(2,'LAYER'); add(70, layers.length);
    for (const layer of layers){
      add(0,'LAYER');
      add(2, layer.name);
      add(70, 0);
      add(62, layer.color);
      add(6, 'CONTINUOUS');
    }
    add(0,'ENDTAB');
    add(0,'ENDSEC');
  }

  function buildEntities(add, entries, texts){
    add(0,'SECTION'); add(2,'ENTITIES');
    for (const { contour, layer, closed = true } of entries){
      // An entry referencing a layer not in the registry still gets
      // written out (using the raw layer string as its DXF layer name)
      // rather than silently reassigned to a known layer or dropped —
      // the person sees this case highlighted in the on-screen preview
      // (see RenderSVG's own unknown-layer handling) so they can fix the
      // element that produced it; the export just needs to not crash.
      const known = Layers.get(layer);
      const layerName = known ? known.name : layer;
      const points = Geo.tessellateContour(contour, ARC_SEGMENTS_PER_CIRCLE, closed);

      add(0,'POLYLINE');
      add(8, layerName);
      add(66,1);   // "vertices follow" marker, required for POLYLINE
      add(70, closed ? 1 : 0);
      add(40,0);   // default start width
      add(41,0);   // default end width

      for (const pt of points){
        add(0,'VERTEX');
        add(8, layerName);
        add(10, Geo.cleanRound(pt.x).toFixed(4));
        add(20, Geo.cleanRound(pt.y).toFixed(4));
        add(30, 0);
      }

      add(0,'SEQEND');
      add(8, layerName);
    }

    const TEXT_HEIGHT_MM = 21;
    for (const { x, y, text, angle = 0 } of (texts || [])){
      const cx = Geo.cleanRound(x), cy = Geo.cleanRound(y);
      add(0,'TEXT');
      add(8, Layers.get('DIMENSIONS').name);
      add(10, cx.toFixed(4));
      add(20, cy.toFixed(4));
      add(30, 0);
      add(40, TEXT_HEIGHT_MM);
      add(1, text);
      add(50, (angle * 180 / Math.PI).toFixed(4)); // DXF rotation is degrees, CCW from X-axis — matches our CAD angle convention directly, no flip needed
      add(72, 1); // horizontal alignment: center
      add(73, 2); // vertical alignment: middle — matches the SVG side's dominant-baseline="central", so (x,y) means the text's true geometric center in both outputs, not its baseline
      add(11, cx.toFixed(4)); // alignment point, required when 72/73 are nonzero
      add(21, cy.toFixed(4));
      add(31, 0);
    }

    add(0,'ENDSEC');
  }

  function build(entries, texts){
    const lines = [];
    const add = (code, value) => { lines.push(String(code)); lines.push(String(value)); };

    add(0,'SECTION'); add(2,'HEADER');
    add(9,'$ACADVER'); add(1,'AC1009');
    add(0,'ENDSEC');

    buildLayerTable(add);
    buildEntities(add, entries, texts);

    add(0,'EOF');
    return lines.join('\r\n') + '\r\n';
  }

  function downloadAs(entries, filename, texts){
    let name = (filename || 'panel').trim();
    if (!name) name = 'panel';
    if (!/\.dxf$/i.test(name)) name += '.dxf';

    const dxfText = build(entries, texts);
    const blob = new Blob([dxfText], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { build, downloadAs };
})();
