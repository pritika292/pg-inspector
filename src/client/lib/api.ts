// Thin fetch wrappers. Keep parsing predictable, throw rich errors so the
// UI can show useful banners.

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    const message =
      typeof parsed === "object" && parsed && "error" in parsed
        ? `${(parsed as { error: string }).error}${"reason" in parsed ? `: ${(parsed as { reason: string }).reason}` : ""}`
        : `request failed (${res.status})`;
    throw new ApiError(message, res.status, parsed);
  }
  return parsed as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "GET" });
  return jsonOrThrow<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return jsonOrThrow<T>(res);
}

// NDJSON streaming consumer: yields each parsed JSON object as it arrives.
// Used for /api/query/explain-ai.
export async function* apiPostStream(path: string, body: unknown): AsyncIterable<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) {
        try {
          yield JSON.parse(line);
        } catch {
          // ignore stray text
        }
      }
    }
  }
  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer);
    } catch {
      // ignore
    }
  }
}
