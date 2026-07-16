const LEGACY_GUIDE_CACHES = ["guia-emocoes-github-v1"];
const NEW_GUIDE_PATH = "/guia-emocoes/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => LEGACY_GUIDE_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );

      const openClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      await self.registration.unregister();

      await Promise.all(
        openClients.map(async (client) => {
          const clientUrl = new URL(client.url);
          const isSameOrigin = clientUrl.origin === self.location.origin;
          const isNewGuide = clientUrl.pathname.startsWith(NEW_GUIDE_PATH);

          if (isSameOrigin && !isNewGuide && "navigate" in client) {
            try {
              await client.navigate(clientUrl.href);
            } catch {
              // A página pode ter sido fechada durante a migração.
            }
          }
        }),
      );
    })(),
  );
});
