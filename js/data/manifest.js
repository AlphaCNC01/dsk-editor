// List of element data files in js/data/ (one name per file, without .js).
// Maintained BY HAND: when you add a new element data file, add its name here
// — the browser cannot list a folder, so this is the one place that has to know.
// Loaded as a classic (blocking)
// script so the data files below are in place before any deferred app script
// runs; the path is derived from this script's own URL, so the same file
// works for index.html and geometry-editor/index.html, over http and file://.
(function(){
  var base = document.currentScript.src.replace(/manifest\.js[^\/]*$/, '');
  [
    "cable-pocket",
    "outlet-block",
    "phone-stand",
    "pullout",
    "pult",
    "tray",
    "underframe",
    "usb-charger",
    "wireless-charger"
  ].forEach(function(f){
    document.write('<script src="' + base + f + '.js"><\/script>');
  });
})();
