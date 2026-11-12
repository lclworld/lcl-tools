// Bump this whenever index.html changes so installed apps pick up the new version.
const CACHE_NAME = "lcl-social-shell-v3";
const SHELL_FILES = ["./index.html", "./manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(SHELL_FILES.map((f) => new Request(f, { cache: "reload" })))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("lcl-social-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App shell: network first, cached copy when offline or slower than 3 seconds.
// Fonts and icons: cache first. Apps Script and Drive images: never touched,
// the app's own localStorage queue handles offline writes.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname.endsWith("script.google.com") || url.hostname.endsWith("googleusercontent.com") || url.hostname.endsWith("drive.google.com")) return;

  const scopePath = new URL(self.registration.scope).pathname;
  const isAppPage = url.origin === self.location.origin &&
    (url.pathname === scopePath || url.pathname === scopePath + "index.html");
  const isShellFile = isAppPage ||
    (url.origin === self.location.origin && SHELL_FILES.some((f) => url.pathname === scopePath + f.replace("./", "")));
  if (req.mode === "navigate" && !isAppPage) return;

  if (isShellFile) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const key = req.mode === "navigate" ? "./index.html" : req;
        const cached = await cache.match(key, { ignoreSearch: true });
        const network = fetch(req.url, { cache: "no-store" }).then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        });
        if (!cached) return network;
        const slow = new Promise((resolve) => setTimeout(() => resolve(cached), 3000));
        event.waitUntil(network.catch(() => {}));
        return Promise.race([network.catch(() => cached), slow]);
      })
    );
    return;
  }

  const isStatic = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "cdn.jsdelivr.net";
  if (isStatic) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === "opaque") cache.put(req, res.clone());
        return res;
      })
    );
  }
});
