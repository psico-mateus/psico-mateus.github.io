/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { secureTransportRedirect, withSecurityHeaders } from "./security";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  APP_SECRET: string;
  SETUP_SECRET: string;
  PUBLIC_SITE_URL?: string;
  GUIDE_URL?: string;
  PORTAL_API_MODE?: "local" | "proxy";
  LEGACY_PORTAL?: Fetcher;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const transportRedirect = secureTransportRedirect(request);
    if (transportRedirect) return transportRedirect;

    if (url.pathname.startsWith("/api/portal")) {
      if (env.PORTAL_API_MODE === "proxy") {
        if (!env.LEGACY_PORTAL) {
          return withSecurityHeaders(
            Response.json(
              { error: "O acesso protegido está temporariamente indisponível." },
              { status: 503 },
            ),
            url.pathname,
          );
        }
        const legacyUrl = new URL(
          url.pathname + url.search,
          "https://registros.psico-mateus.workers.dev",
        );
        try {
          return withSecurityHeaders(
            await env.LEGACY_PORTAL.fetch(new Request(legacyUrl, request)),
            url.pathname,
          );
        } catch {
          console.error(JSON.stringify({ event: "legacy_portal_unavailable" }));
          return withSecurityHeaders(
            Response.json(
              { error: "O acesso protegido está temporariamente indisponível." },
              { status: 503 },
            ),
            url.pathname,
          );
        }
      }
      if (env.PORTAL_API_MODE !== "local") {
        return withSecurityHeaders(
          Response.json(
            { error: "O acesso protegido está temporariamente indisponível." },
            { status: 503 },
          ),
          url.pathname,
        );
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return withSecurityHeaders(await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths), url.pathname);
    }

    return withSecurityHeaders(await handler.fetch(request, env, ctx), url.pathname);
  },
};

export default worker;
