// ============================================================================
// UI.createInstanceListManager — generic instance-list manager, the base
// every repeatable element (chargers, outlet blocks, phone stands, trays,
// pull-out stands, USB chargers, etc.) is built on top of via
// UI.createEmbeddableManager (see field-helpers.js). Kept separate from
// that factory since this part has no knowledge of anchors/insets/cable
// channels at all — it only knows "an array of plain objects, rebuilt into
// DOM rows whenever it changes, with each row's inputs mutating their own
// object directly".
// ============================================================================

const UI = (() => {
  const el = id => document.getElementById(id);

  // Every repeatable element (chargers, outlet blocks, phone stands,
  // trays, pull-out stands, USB chargers) follows the same UI pattern: a
  // JS array is the source of truth, rows are rebuilt into a DOM
  // container whenever the array changes, and each row's inputs mutate
  // their own instance object directly. This factory captures that
  // pattern once instead of repeating it per element — `rowHtml` builds
  // one row's inner markup from an instance + its index, `defaults`
  // supplies a new instance's starting values, and `extraFieldNames`
  // lists any select fields (besides the anchor field every list has)
  // that need special "changing this repaints the whole row" handling,
  // e.g. a variant/type selector.
  function createInstanceListManager({ containerId, addBtnId, itemLabel, defaults, rowHtml, onChange, onFieldChange, dimensionsDefault = true, onTypeChange = null }){
    // A new project starts with none of these instances — the user adds
    // only what they actually need, rather than getting one by default
    // and having to delete it. (Loading a saved project still restores
    // whatever list that project had, via setItems below.)
    let items = [];
    // onFieldChange (defaults to onChange if not given separately) is
    // what fires per keystroke on a row's own text/number field — kept
    // distinguishable from add/remove's onChange so callers can debounce
    // just the keystroke-driven path (see debouncedRender's own comment)
    // without also delaying the instant feedback of clicking + Add or
    // Remove, which aren't bursty and shouldn't feel laggy.
    const fieldChange = onFieldChange || onChange;

    function add(){
      items.push({ ...defaults(), dimensionsOn: dimensionsDefault });
      renderList();
      onChange();
    }

    function remove(idx){
      items.splice(idx, 1);
      renderList();
      onChange();
    }
    function renderList(){
      const container = el(containerId);
      container.innerHTML = '';
      items.forEach((instance, idx) => {
        const row = document.createElement('div');
        row.className = 'instance-row';
        row.innerHTML = `
          <div class="instance-row-header">
            <span class="instance-row-title">${itemLabel} №${idx + 1}</span>
            <button type="button" class="instance-remove-btn" data-idx="${idx}">Удалить</button>
          </div>
          <div class="toggle-row">
            <span>Размерные линии</span>
            <label class="switch">
              <input type="checkbox" data-field="dimensionsOn" data-idx="${idx}">
              <span class="track"></span>
            </label>
          </div>
          ${rowHtml(instance, idx)}
        `;
        // Restore select values explicitly — setting them via the HTML
        // string's `value` attribute doesn't reliably select the right
        // <option> for dynamically-built markup, same as the charger's
        // original list logic. Checkboxes need the same explicit restore
        // treatment, since a `checked` attribute string in rowHtml can't
        // carry boolean state reliably either. Undefined dimensionsOn
        // (an instance saved before this field existed, from any
        // element) reads as ON — old projects keep showing their
        // dimensions on load rather than silently losing them — while a
        // freshly created instance gets an explicit true/false from
        // dimensionsDefault (see createInstanceListManager), which is
        // what lets an element opt OUT of dimensions by default (cable
        // pockets, phone stand) without affecting saved projects.
        row.querySelectorAll('select[data-field]').forEach(sel => {
          sel.value = instance[sel.dataset.field];
        });
        row.querySelectorAll('input[type="checkbox"][data-field="dimensionsOn"]').forEach(cb => {
          cb.checked = instance.dimensionsOn !== false;
        });
        row.querySelectorAll('input[type="checkbox"][data-field]:not([data-field="dimensionsOn"])').forEach(cb => {
          cb.checked = !!instance[cb.dataset.field];
        });
        container.appendChild(row);
      });

      container.querySelectorAll('[data-field]:not(.anchor-grid-btn)').forEach(input => {
        const handler = () => {
          const idx = parseInt(input.dataset.idx, 10);
          const field = input.dataset.field;
          const isNumeric = input.type === 'number';
          const isCheckbox = input.type === 'checkbox';
          // A blank numeric field is kept as null (rather than coerced to
          // 0) so fields with a computed placeholder default — like the
          // USB charger's insetX — can fall back to that live default in
          // buildContours instead of silently becoming a real zero inset.
          items[idx][field] = isCheckbox ? input.checked
            : isNumeric ? (input.value === '' ? null : (parseFloat(input.value) || 0))
            : input.value;
          if (field === 'type' && onTypeChange) onTypeChange(items[idx]);
          if (input.tagName === 'SELECT') {
            renderList(); // a select change may affect which fields this row shows (e.g. anchor axis visibility)
          }
          // Number/text fields fire on every keystroke — debounced, so
          // typing "150" into an inset field re-renders once after the
          // person pauses, not three times for "1", "15", "150". A select
          // or checkbox change is a single discrete click, not a typing
          // burst, so it stays instant.
          if (isNumeric || input.type === 'text') fieldChange();
          else onChange();
        };
        input.addEventListener('input', handler);
        input.addEventListener('change', handler);
      });
      // Anchor-grid buttons aren't <select>/<input> so they don't fire
      // input/change — handled separately via click. Same downstream
      // effect as a select change (anchor affects which X/Y fields this
      // row shows), so it re-renders the list the same way.
      container.querySelectorAll('.anchor-grid-btn[data-field]').forEach(btn => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const field = btn.dataset.field;
          items[idx][field] = btn.dataset.value;
          renderList();
          onChange();
        });
      });
      container.querySelectorAll('.instance-remove-btn').forEach(btn => {
        btn.addEventListener('click', () => remove(parseInt(btn.dataset.idx, 10)));
      });
    }

    el(addBtnId).addEventListener('click', add);
    renderList();

    // setItems replaces the whole instance list wholesale (used by
    // project load) — each loaded instance is merged over a fresh
    // defaults() so a saved file from an older version of the app that's
    // missing a newer field still gets that field's current default
    // rather than ending up undefined. An empty saved list is kept
    // empty — the user may have deliberately removed every instance of
    // this element before saving, and that's exactly what a reload
    // should restore, not silently re-add one with default values.
    function setItems(newItems){
      items = (newItems || []).map(it => ({ ...defaults(), ...it }));
      renderList();
    }

    return { get items(){ return items; }, renderList, setItems };
  }

  return { el, createInstanceListManager };
})();
