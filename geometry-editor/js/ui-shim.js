// ============================================================================
// The entire UI namespace this editor needs — just enough for the
// the main app's js/ui/zoom.js (loaded directly from ../js/ui/) to run. Loaded
// before zoom.js in index.html; none of the real app's other js/ui/
// modules (instance lists, anchor pickers, cable-channel wiring) apply
// to this editor, so only this one function is reproduced here.
// ============================================================================
const UI = { el: id => document.getElementById(id) };
