// ============================================================================
// The entire UI namespace this editor needs — just enough for the
// verbatim-copied js/zoom.js (see that file's own header) to run. Loaded
// before zoom.js in index.html; none of the real app's other js/ui/
// modules (instance lists, anchor pickers, cable-channel wiring) apply
// to this editor, so only this one function is reproduced here.
// ============================================================================
const UI = { el: id => document.getElementById(id) };
