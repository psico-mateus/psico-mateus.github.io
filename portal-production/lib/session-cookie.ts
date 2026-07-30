export const SESSION_COOKIE = "portal_session";
export const SESSION_SECONDS = 8 * 60 * 60;

function decodeCookieValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}

export function parseCookies(request: Request): Record<string, string> {
  const value = request.headers.get("cookie") ?? "";
  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [
          part.slice(0, separator),
          decodeCookieValue(part.slice(separator + 1)),
        ];
      }),
  );
}

export function sessionCookie(
  request: Request,
  token: string,
  maxAge = SESSION_SECONDS,
): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request): string {
  return sessionCookie(request, "", 0);
}
