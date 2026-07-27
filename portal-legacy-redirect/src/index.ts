const PATIENT_AREA_ORIGIN =
  "https://area-do-paciente.psico-mateus.workers.dev";

export default {
  async fetch(request: Request): Promise<Response> {
    const currentUrl = new URL(request.url);
    const destination = new URL(currentUrl.pathname + currentUrl.search, PATIENT_AREA_ORIGIN);

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
