import { Elements } from '@core/elements.js';
import { UNDERFRAME_DEFAULT_TYPE } from '@elements/underframe.js';

// ============================================================================
// populateUnderframeTypeOptions — fills the underframe type <select> (its
// "Нет подстолья" / none option is static markup in this app's own
// index.html, since it isn't a real UNDERFRAME_VARIANTS entry) from
// whatever underframe variants actually got registered. Moved here from
// packages/elements/underframe.js as part of the ES-module split — that
// package is shared by every app (including a client app that won't use
// a <select> for this at all), so it can't reach into `document` itself
// any more. See underframe.js's own comment for the full reasoning.
//
// Call once, after '@elements/underframe.js' has been imported (so its
// Elements.register(...) side effect has already run) and after this
// app's own index.html has rendered the <select id="underframeType">
// element — typically from main.js, right after the element imports.
// ============================================================================
export function populateUnderframeTypeOptions(){
  const select = document.getElementById('underframeType');
  if (!select) return;
  const registered = Elements.all().find(e => e.id === 'underframe');
  if (!registered) return; // underframe.js wasn't imported in this app — nothing to populate
  const variants = registered.VARIANTS;
  const previousValue = select.value; // 'none', the only static option
  for (const key of Object.keys(variants)) {
    if (select.querySelector(`option[value="${key}"]`)) continue; // don't duplicate on re-run
    const v = variants[key];
    const option = document.createElement('option');
    option.value = key;
    option.textContent = v.sku && v.label ? `${v.sku} — ${v.label}` : (v.label || v.sku || key);
    select.appendChild(option);
  }
  // A saved project's own value is applied later by app-project.js's own
  // load path, which sets .value directly and doesn't depend on this
  // select's default — this only decides what a brand-new, never-loaded
  // project starts on.
  select.value = (previousValue && previousValue !== 'none') ? previousValue : UNDERFRAME_DEFAULT_TYPE;
}
