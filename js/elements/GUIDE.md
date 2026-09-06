# How to Add a New Simple Element

A **simple element** is anything placed on the tabletop at an `anchor + inset` position, optionally with rotation/mirror and a type variant.

Examples include:

- charger
- pocket
- tray
- other tabletop elements

This is a step-by-step checklist. Follow it from top to bottom and the new element will be fully wired everywhere:

- Preview
- DXF/SVG export
- Save/load
- Cable channels, if relevant

---

## Step 1 — Geometry

Find the **Elements** section further down and add:

```js
const MY_ELEMENT_VARIANTS = registerSimpleEmbeddable({
  id: 'myElement',            // internal id, only used for debugging
  paramsKey: 'myElements',    // THE KEY. Same string used in every
                              // other step below. Pick it once here.
  defaultVariant: 'standard',
  variants: {
    standard: {
      parts: [
        {
          verts: [
            // ...bulge-arc vertices, local (0,0)-centered...
          ],
          layer: 'PHYSICAL'
        },
      ]
    },
  },
});
```

### `verts`

`verts` is a list of `{ x, y, bulge }` points in the element's **own local space**.

- `(0,0)` is whatever point makes sense as this element's anchor.
- The element's own geometric center is the usual choice.

### `layer`

`layer` controls both:

1. Machining metadata (see the **Layers registry**).
2. Preview color.

Reuse an existing layer name from the **Layers registry** (see `js/core/layers.js` — e.g. `PHYSICAL` for reference/structural outlines, `HOLES` for mounting holes, `CUTOUT` for a through-cut opening), or add a new one if this element needs its own depth/color.

For example:

```js
MY_LAYER: {
  name: 'MY_LAYER',
  color: 3,
  style: {
    stroke: '#4cc97c',
    fillOpacity: 0.1,
    strokeWidth: 1.5
  },
  machining: {
    side: 'bottom',
    depth: 5,
    depthAnchor: 'top',
    millType: 'pocket'
  }
},
```

That single entry is enough: the preview, PNG/SVG export, and DXF export all read color/style directly from this registry. There is no separate CSS or export style list to update.

### DXF color

`color` is the DXF color index:

| Index | Color |
|---:|---|
| `1` | Red |
| `2` | Yellow |
| `3` | Green |
| `4` | Cyan |
| `5` | Blue |
| `6` | Magenta |
| `7` | White/black |

This color is used by DXF-reading CAD tools and is independent of `style.stroke`, which is what the app's own preview/export uses.

### Machining

`machining` is optional.

Omit it entirely for a layer that is purely reference geometry and is never milled, such as `DIMENSIONS`.

`millType` is either `'pocket'` (clear the whole enclosed area) or one of three contour-following modes that only differ in cutter-radius compensation: `'contour'` (cut exactly along the path), `'outside'` (offset outward, so the piece inside the path comes out full size — e.g. the tabletop's own silhouette), or `'inside'` (offset inward, so the opening inside the path comes out full size — e.g. a cutout for an insert).

See the comment atop `Layers.registry` for the meaning of every machining field.

### Cable node

If a cable channel should be able to start or end at this element, also add a `cableNode` next to `parts` in the relevant variant:

```js
cableNode: {
  x,
  y,
  dir: {
    x,
    y
  }
}
```

See **Cable channels** below.

---

## Step 2 — UI + Everything Else

Find where the other managers are created by searching for:

```text
createEmbeddableManager
```

Add:

```js
const myElementMgr = createEmbeddableManager({
  key: 'myElements',               // SAME string as paramsKey above
  label: 'Мой элемент',            // section title + row title
  defaults: {
    anchor: 'topRight',
    insetX: 100,
    insetY: 100
  },
  // dimensionsDefault: false,     // optional — see below
});
```

That's it — **no HTML is required**.

`key` + `label` are enough. `createEmbeddableManager` automatically creates:

- the section title;
- the list;
- the **Add** button.

It then appends the section to the controls panel.

### Section order

Every element in the app works this way.

The visible order of sections is simply the order in which `createEmbeddableManager` calls appear in the code.

To reorder the sections, move the corresponding call.

### Show dimensions

Every instance automatically gets its own **Show dimensions** toggle per row.

Nothing needs to be added manually — it is already built into `rowHtml`.

The toggle:

- defaults to **ON**;
- can be disabled by default for new instances with `dimensionsDefault: false`;
- remains available even when disabled by default, so the user can turn dimensions back on for an individual instance.

For example:

```js
dimensionsDefault: false
```

This only affects **newly created instances**.

Existing instances from an already-saved project keep whatever value was saved with them.

---

## Step 3 — Register It

Find `ELEMENT_MANAGERS` — search for:

```text
ELEMENT_MANAGERS
```

Add one line:

```js
{
  key: 'myElements',
  mgr: myElementMgr
},
```

That's it.

This single array drives:

- resolving instances into drawing parameters;
- refreshing UI placeholders;
- saving projects;
- loading projects.

Nothing else needs to be changed for a plain element.

---

# Optional — Type Selector

If the element has multiple variants that the user can choose between, add a `typeSelector`.

Examples include:

- pult: `Стандартный` / `Встраиваемый с USB`
- cablePocket: `Большая` / `Малая`

Add the selector to the `createEmbeddableManager` configuration:

```js
typeSelector: {
  label: '...',
  options: [
    { value: 'typeA', text: '...' },
    { value: 'typeB', text: '...' },
  ]
}
```

Then register each option's geometry under its corresponding name in `variants` from **Step 1**.

---

## Type-Specific Position Defaults

If different types need different position defaults — for example, two `cablePocket` sizes defaulting to different corners — add `typeDefaults` alongside `defaults`.

Each type gets its own object, which can define:

- `anchor`
- `insetX`
- `insetY`

These values can be either plain values or functions of `(inst, p)`, just like `defaults`.

Example:

```js
defaults: {
  type: 'typeA'
},

typeDefaults: {
  typeA: {
    anchor: 'right',
    insetX: 400,
    insetY: 100
  },
  typeB: {
    anchor: 'topRight',
    insetX: 225,
    insetY: 200
  },
},
```

### How defaults are applied

`insetX` and `insetY` continue to work like a plain element's defaults:

- they act as live placeholders;
- the user's own value overrides the placeholder;
- switching type automatically updates the placeholder to the new type's default.

`anchor` has no placeholder concept in the UI because it is a discrete choice.

Instead, it is resolved:

1. when a new instance is created;
2. whenever the user switches that instance's type.

In both cases, the anchor comes from that type's `typeDefaults` entry.

This prevents a stale anchor from being carried over from another type.

---

# Optional — Cable Channels

If the element can be a **source or target for a milled cable channel**, two things are required.

### 1. Add a `cableNode`

Add the `cableNode` in **Step 1**. This works the same whether the element is a source, a target, or both.

### 2a. Wiring a new TARGET element

Every source's `cableTarget` field is resolved by `resolveCableTarget` inside the `cableChannels` element (search for `Element: Cable channels`). It currently understands three target kinds: `'none'`, `'tslot'` (the T-slot notch, a fixed single target — see `tSlotEntryPoints`), and `'smallPocket:<n>'` / `'bigPocket:<n>'` (the n-th instance, 0-based in creation order, of that `cablePocket` type — see `worldNodes`).

To add a brand-new TARGET element (not just another `cablePocket` type), extend `resolveCableTarget` with one more branch that resolves your element's own key/prefix into a world-space node the same way the pocket branch does — filter that element's own instances (by type, if it has variants), call `worldNodes` on them, and index into the result.

### 2b. Wiring a new SOURCE element

A source just needs:

1. Its own `cableTarget` field on each instance (a plain string, defaulting to `'none'`), driven by `UI.cableTargetSelectHtml`/`cableTargetLabel` in its manager config (see `chargerMgr`/`usbChargerMgr`/`pultMgr` in `element-managers.js`) — **every** source offers the exact same target vocabulary (T-slot + every pocket of every type), so there is nothing element-specific to configure there beyond the label.
2. One `routeToChosenTarget(instances, variantsById, width, layer, p, entries)` call added to `buildContours`, alongside the existing three.

### Target no longer exists

If a source's chosen `cableTarget` no longer resolves (pocket deleted, its type changed, or the T-slot removed), `resolveCableTarget` returns `null` and that source's channel is silently skipped — it does **not** fall back to some other target. This is a deliberate choice: the person picked a specific target, so silently rerouting to a different one would be a surprise, not a convenience.

---

# Final Checklist

For a plain simple element, the entire process boils down to:

1. **One geometry registration**
2. **One manager call**
3. **One registry line**

Everything else is already handled automatically.

The system loops over:

- `ELEMENT_MANAGERS`
- the Elements registry

Therefore, the following features do **not** need to know about the new element key in advance:

- parameter resolving;
- DXF export;
- SVG export;
- placeholders;
- project save/load.

Once the three registration steps are complete, the new element is fully wired throughout the application.
