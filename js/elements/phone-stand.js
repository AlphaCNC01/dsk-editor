// ============================================================================
// Element: Подставка для телефона (phone stand). Single-contour vector
// (no holes in the source file). Positioned via a single anchor + center
// inset. Default: 225mm left and 105mm down from the top-right corner.
// ============================================================================
const PHONE_STAND_VARIANTS = registerSimpleEmbeddable({
  id: 'phoneStand',
  paramsKey: 'phoneStands',
  defaultVariant: 'standard',
  variants: ElementData.variants('phoneStand'),
});
