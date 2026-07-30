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
  let response: Response;
  try {
    response = await fetch(`/api/portal${path}`, {
      ...init,
      headers,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new PortalRequestError(
      0,
      "Não foi possível se conectar. Verifique sua internet e tente novamente.",
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new PortalRequestError(
      response.status,
      payload.error || "Não foi possível concluir a ação.",
    );
  }
  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch {
    throw new PortalRequestError(
      502,
      "A resposta do serviço não pôde ser lida. Tente novamente.",
    );
  }
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatViewTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "data indisponível";
  const day = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return `${day} às ${time}`;
}
