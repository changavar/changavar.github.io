const CACHE_PREFIX = "hesabyar-shell-";
const APP_ROOT = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const appPath = (path = "") => `${APP_ROOT}/${path}`;
const CACHE_NAME = `${CACHE_PREFIX}v4-20260717${APP_ROOT.replaceAll("/", "-") || "-root"}`;
const APP_SHELL = [appPath("manifest.webmanifest"), appPath("favicon.svg"), appPath("app-icon.svg")];

const cacheResponse = async (request, response) => {
  if (!response || response.status !== 200 || response.type !== "basic") return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
};

const networkFirstPage = async (request) => {
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.status === 200 && response.type === "basic") {
      await cacheResponse(request, response);
      const cache = await caches.open(CACHE_NAME);
      await cache.put(appPath(), response.clone());
    }
    return response;
  } catch {
    return (await caches.match(request)) || (await caches.match(appPath())) || Response.error();
  }
};

const cacheFirstAsset = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await cacheResponse(request, response);
  return response;
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(async (keys) => {
        const oldCaches = keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME);
        await Promise.all(oldCaches.map((key) => caches.delete(key)));
        await self.clients.claim();

        // A v1 cache could keep an old HTML shell pointing to deleted JS chunks.
        // Refresh only upgraded clients so a previously stuck page recovers itself.
        if (oldCaches.length) {
          const clients = await self.clients.matchAll({ type: "window" });
          await Promise.all(clients.map((client) => client.navigate(client.url).catch(() => undefined)));
        }
      }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname === appPath("sw.js")) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirstPage(event.request));
    return;
  }

  if (url.pathname.startsWith(appPath("_next/static/")) || url.pathname.startsWith(appPath("assets/"))) {
    event.respondWith(cacheFirstAsset(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => cacheResponse(event.request, response))
      .catch(() => caches.match(event.request)),
  );
});
