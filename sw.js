// Service worker DSK Editor.
// Стратегия: stale-while-revalidate. Файл отдаётся из кэша мгновенно (работает офлайн),
// а в фоне при наличии сети обновляется — свежая версия появляется при следующем открытии.
// Поэтому вручную менять версию при каждом релизе не нужно. CACHE_VERSION меняйте только
// если нужно принудительно сбросить кэш (например, переименовали/удалили файлы).
const CACHE_VERSION = 'v4';
const CACHE = 'dsk-editor-' + CACHE_VERSION;

const PRECACHE = [
  "./",
  "assets/wood_texture.webp",
  "css/mobile.css",
  "css/styles.css",
  "favicon.svg",
  "geometry-editor/index.html",
  "geometry-editor/js/contour-list.js",
  "geometry-editor/js/editor-state.js",
  "geometry-editor/js/main.js",
  "geometry-editor/js/registry.js",
  "geometry-editor/js/render.js",
  "geometry-editor/js/resize.js",
  "geometry-editor/js/save.js",
  "geometry-editor/js/svg-import.js",
  "geometry-editor/js/transform.js",
  "geometry-editor/js/ui-shim.js",
  "geometry-editor/styles.css",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "index.html",
  "js/core/drawing.js",
  "js/core/elements.js",
  "js/core/geo.js",
  "js/core/layers.js",
  "js/core/routing.js",
  "js/elements/cable-channels.js",
  "js/elements/cable-pocket.js",
  "js/elements/hole.js",
  "js/elements/outlet-block.js",
  "js/elements/phone-stand.js",
  "js/elements/pullout.js",
  "js/elements/pult.js",
  "js/elements/tabletop.js",
  "js/elements/tray.js",
  "js/elements/underframe.js",
  "js/elements/usb-charger.js",
  "js/elements/wireless-charger.js",
  "js/export/dxf.js",
  "js/export/gcode-preview.js",
  "js/export/gcode-post.js",
  "js/export/gcode-profile.js",
  "js/export/gcode-toolpath.js",
  "js/export/gcode.js",
  "js/export/png.js",
  "js/export/svg.js",
  "js/render/dimensions.js",
  "js/render/svg.js",
  "js/ui/app-history.js",
  "js/ui/app-project.js",
  "js/ui/app-render.js",
  "js/ui/app-state.js",
  "js/ui/configurator-import.js",
  "js/ui/element-managers.js",
  "js/ui/field-helpers.js",
  "js/ui/instance-list.js",
  "js/ui/zoom.js",
  "manifest.webmanifest",
  "vendor/clipper.min.js",
  "vendor/codemirror/codemirror.min.css",
  "vendor/codemirror/codemirror.min.js",
  "vendor/codemirror/dracula.min.css",
  "vendor/codemirror/javascript.min.js",
  "vendor/codemirror/matchbrackets.min.js",
  "vendor/decimal.min.js",
  "icons/icon-maskable-512.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // по одному, чтобы отсутствующий файл не ломал установку целиком
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('dsk-editor-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { event.waitUntil(network); return cached; }
      const res = await network;
      if (res) return res;
      // офлайн и нет в кэше: для переходов по страницам отдаём главную
      if (req.mode === 'navigate') { const home = await cache.match('./'); if (home) return home; }
      return new Response('Офлайн, файла нет в кэше', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    })
  );
});
