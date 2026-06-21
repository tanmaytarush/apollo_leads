const APOLLO_BASE = "https://api.apollo.io/api/v1";

export function getApiKey(): string {
  const key = process.env.APOLLO_API_KEY;
  if (!key) {
    throw new Error("APOLLO_API_KEY is not set in environment variables");
  }
  return key;
}

export interface ProbeResult {
  ok: boolean;
  freePlanBlocked: boolean;
  status?: number;
  error?: string;
  data?: unknown;
}

export async function apolloFetch<T>(
  endpoint: string,
  options: RequestInit = {},
  _retry = false
): Promise<T> {
  const response = await fetch(`${APOLLO_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      accept: "application/json",
      "X-Api-Key": getApiKey(),
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Apollo API key invalid or expired (401). Check APOLLO_API_KEY in .env.");
    }
    if (response.status === 429 && !_retry) {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return apolloFetch(endpoint, options, true);
    }
    const text = await response.text();
    throw new Error(`Apollo API error (${response.status}): ${text.slice(0, 300)}`);
  }

  return response.json() as Promise<T>;
}

export async function probeEndpoint(
  endpoint: string,
  options: RequestInit = {}
): Promise<ProbeResult> {
  try {
    getApiKey();
    const response = await fetch(`${APOLLO_BASE}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        accept: "application/json",
        "X-Api-Key": getApiKey(),
        ...options.headers,
      },
    });

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    const freePlanBlocked =
      response.status === 403 &&
      (text.includes("free plan") || text.includes("API_INACCESSIBLE"));

    return {
      ok: response.ok,
      freePlanBlocked,
      status: response.status,
      error: response.ok ? undefined : text.slice(0, 200),
      data: response.ok ? data : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      freePlanBlocked: false,
      error: err instanceof Error ? err.message : "Request failed",
    };
  }
}

export { APOLLO_BASE };
