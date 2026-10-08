const APP_BUILD_ID = "__CLIENT_BUILD_ID__";

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_BUILD_ID") {
    event.ports?.[0]?.postMessage({ buildId: APP_BUILD_ID });
    return;
  }
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Documentos e seus redirecionamentos seguem a navegação nativa do navegador.
  // Encaminhá-los por respondWith(fetch(...)) pode travar a navegação no WebKit.
  if (request.mode === "navigate") return;

  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // O portal nunca guarda páginas autenticadas nem informações clínicas em cache.
  event.respondWith(fetch(request));
});
