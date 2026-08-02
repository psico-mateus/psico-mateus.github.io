export class PortalRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PortalRequestError";
    this.status = status;
  }
}

export const SLOW_MUTATION_NOTICE_MS = 12_000;

type SlowMutationListener = (pending: boolean) => void;

const slowMutationListeners = new Set<SlowMutationListener>();
let announcedSlowMutations = 0;

function notifySlowMutationListeners() {
  const pending = announcedSlowMutations > 0;
  for (const listener of slowMutationListeners) listener(pending);
}

export function subscribeToSlowPortalMutations(
  listener: SlowMutationListener,
): () => void {
  slowMutationListeners.add(listener);
  return () => slowMutationListeners.delete(listener);
}

export async function portalRequest<T>(
  path: string,
  init: RequestInit = {},
  csrf?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("x-csrf-token", csrf);
  const method = (init.method ?? "GET").toUpperCase();
  const tracksSlowMutation = method !== "GET" && method !== "HEAD";
  let announcedAsSlow = false;
  const slowMutationTimer = tracksSlowMutation
    ? setTimeout(() => {
        announcedAsSlow = true;
        const alreadyPending = announcedSlowMutations > 0;
        announcedSlowMutations += 1;
        if (!alreadyPending) notifySlowMutationListeners();
      }, SLOW_MUTATION_NOTICE_MS)
    : undefined;

  try {
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
  } finally {
    if (slowMutationTimer !== undefined) clearTimeout(slowMutationTimer);
    if (announcedAsSlow) {
      announcedSlowMutations = Math.max(0, announcedSlowMutations - 1);
      if (announcedSlowMutations === 0) notifySlowMutationListeners();
    }
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
