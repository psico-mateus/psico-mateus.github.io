const CACHE_NAME = "guia-emocoes-scoped-v18";
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
  "/assets/js/guide-navigation.js",
  "/assets/images/favicon/logo-mateus-192.png",
  "/assets/images/favicon/logo-mateus-512.png",
  "/assets/images/favicon/apple-touch-icon.png",
  "/assets/images/logo-mateus.svg",
  "/assets/downloads/Guia_Pratico_para_Reconhecer_Emocoes.pdf",
]);
const CORE_ASSETS = [
  GUIDE_PATH,
  `${GUIDE_PATH}index.html`,
  `${GUIDE_PATH}manifest.webmanifest`,
  "/assets/index-BBQ5DOp1.css?v=20260716-final",
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
