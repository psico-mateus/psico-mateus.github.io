const CACHE_NAME = "guia-emocoes-scoped-v4";
const CACHE_PREFIX = "guia-emocoes-scoped-";
const GUIDE_PATH = "/guia-emocoes/";
const GUIDE_ASSET_PATHS = new Set([
  "/assets/EmotionGuideApp-BiKEL11_.js",
  "/assets/framework-DjPHiq1u.js",
  "/assets/index-T97Jq6Mn.js",
  "/assets/layout-segment-context-wPpdvAA5.js",
  "/assets/rolldown-runtime-S-ySWqyJ.js",
  "/assets/index-BBQ5DOp1.css",
  "/assets/css/guide-brand.css",
  "/assets/images/favicon/logo-mateus-192.png",
]);
const CORE_ASSETS = [
  GUIDE_PATH,
  `${GUIDE_PATH}index.html`,
  `${GUIDE_PATH}manifest.webmanifest`,
  ...GUIDE_ASSET_PATHS,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isGuideRequest =
    url.pathname.startsWith(GUIDE_PATH) || GUIDE_ASSET_PATHS.has(url.pathname);
  if (url.origin !== self.location.origin || !isGuideRequest) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)),
            );
          }
          return response;
        })
        .catch(async () =>
          (await caches.match(event.request)) || caches.match(GUIDE_PATH),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)),
            );
          }
          return response;
        }),
    ),
  );
});
