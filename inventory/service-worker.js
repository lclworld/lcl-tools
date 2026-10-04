// Bump this whenever index.html changes so installed apps pick up the new version.
const CACHE_NAME = "lcl-inventory-shell-v2";
const SHELL_FILES = ["./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // cache: "reload" skips the browser's HTTP cache so a new version is really fetched.
      cache.addAll(SHELL_FILES.map((f) => new Request(f, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App shell (index.html, manifest): served from cache instantly, then refreshed
// in the background so the next open has the latest version.
// Fonts and pdf.js (versioned, never change): cache-first.
// Apps Script calls: never touched — the app's own localStorage queue handles offline.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.hostname.endsWith("script.google.com") || url.hostname.endsWith("googleusercontent.com")) return;

  const isShellFile =
    req.mode === "navigate" ||
    SHELL_FILES.some((f) => url.pathname.endsWith(f.replace("./", "")));

  if (isShellFile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Page loads ("/inventory/", "/inventory/index.html?x") all share the index.html entry.
        const key = req.mode === "navigate" ? "./index.html" : req;
        const cached = await cache.match(key, { ignoreSearch: true });
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(key, res.clone());
            return res;
          })
          .catch(() => cached);
        if (cached) {
          event.waitUntil(network);
          return cached;
        }
        return network;
      })
    );
    return;
  }

  const isStatic =
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com" ||
    url.hostname === "cdnjs.cloudflare.com";

  if (isStatic) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
