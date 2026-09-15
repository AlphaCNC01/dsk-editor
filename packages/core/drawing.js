import { Elements } from './elements.js';

// ============================================================================
// Drawing — composes every registered element's contours into one flat list
// of { contour, layer } entries. This is the single artifact that both the
// SVG preview and the DXF exporter consume; neither needs to know how many
// elements exist or how each one builds its geometry.
//
// Elements register themselves into Elements' own registry as a SIDE EFFECT
// of their module being imported (each element file ends with a call to
// Elements.register(...) or registerSimpleEmbeddable(...) at module-load
// time, not inside any function). Under the old <script>-tag setup this
// happened automatically because every element file was tag-included on
// every page; as ES modules, an element only registers if something
// actually imports it — so each app's own entry point (main.js) is
// responsible for importing every element it wants available, typically
// via a single '@elements/index.js' barrel import for "all of them" (the
// engineer app) or a curated subset (a future client app that only offers
// some element types). Drawing.build itself doesn't know or care which
// elements got registered; it just walks whatever's there.
// ============================================================================
export const Drawing = (() => {
  function build(params){
    const entries = [];
    for (const element of Elements.all()){
      const parts = element.buildContours(params) || [];
      for (const part of parts) entries.push(part);
    }
    return entries;
  }
  return { build };
})();
