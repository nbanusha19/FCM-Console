export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = RequestInit & {
  auth?: boolean;
  token?: string | null;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, token, headers, ...init } = options;
  try {
    const defaultApiBase = typeof window === "undefined"
      ? "http://localhost:8000/api"
      : `${window.location.protocol}//${window.location.hostname}:8000/api`;
    const apiBase = (import.meta.env.VITE_API_URL || defaultApiBase).replace(/\/+$/, "");
    const requestHeaders = new Headers(headers);
    const hasBody = init.body !== undefined && init.body !== null;
    if (hasBody && !requestHeaders.has("Content-Type") && !(init.body instanceof FormData)) {
      requestHeaders.set("Content-Type", "application/json");
    }
    const accessToken = auth
      ? token ?? (typeof window !== "undefined" ? window.localStorage.getItem("visitflow_access_token") : null)
      : null;
    if (accessToken) requestHeaders.set("Authorization", `Bearer ${accessToken}`);

    const response = await fetch(`${apiBase}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers: requestHeaders,
    });
    if (!response.ok) {
      let message = `Request failed (${response.status})`;
      try {
        const payload = (await response.json()) as { detail?: string; message?: string };
        message = payload.detail ?? payload.message ?? message;
      } catch {
        // Preserve the HTTP status message if the server response is not JSON.
      }
      throw new ApiError(message, response.status);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const error = err as { message?: string; status?: number };
    throw new ApiError(error.message ?? "The backend API could not be reached.", error.status ?? 0);
  }
}
