const PATIENT_AREA_ORIGIN =
  "https://area-do-paciente.psico-mateus.workers.dev";

interface Env {
  PATIENT_AREA: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const currentUrl = new URL(request.url);
    const destination = new URL(currentUrl.pathname + currentUrl.search, PATIENT_AREA_ORIGIN);

    // Aplicativos instalados antes da mudança de endereço podem continuar
    // executando a interface em cache no domínio antigo. Encaminhar apenas a
    // API mantém login, cadastro e sessão funcionando até a reinstalação, sem
    // duplicar banco ou regras de autenticação.
    if (currentUrl.pathname.startsWith("/api/")) {
      const upstreamRequest = new Request(destination, request);
      const upstreamResponse = await env.PATIENT_AREA.fetch(upstreamRequest);
      const headers = new Headers(upstreamResponse.headers);
      headers.set("Cache-Control", "no-store, max-age=0");
      headers.set("Referrer-Policy", "no-referrer");
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");

      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText,
        headers,
      });
    }

    return new Response(null, {
      status: 308,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "public, max-age=300",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive",
      },
    });
  },
};
