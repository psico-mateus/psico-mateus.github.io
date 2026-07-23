export class PortalRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PortalRequestError";
    this.status = status;
  }
}

export async function portalRequest<T>(
  path: string,
  init: RequestInit = {},
  csrf?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("x-csrf-token", csrf);
  const response = await fetch(`/api/portal${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new PortalRequestError(
      response.status,
      payload.error || "Não foi possível concluir a ação.",
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
