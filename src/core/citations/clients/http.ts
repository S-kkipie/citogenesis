export type FetchLike = typeof fetch;

export interface HttpOpts {
  fetchImpl?: FetchLike;
  maxRetries?: number;
  baseDelayMs?: number;
}

export class HttpError extends Error {
  constructor(public status: number, url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryable = (s: number) => s === 429 || s >= 500;

export async function getJson<T>(url: string, opts: HttpOpts = {}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxRetries = opts.maxRetries ?? 3;
  const base = opts.baseDelayMs ?? 500;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(base * 2 ** attempt);
      continue;
    }
    if (res.ok) return (await res.json()) as T;
    if (retryable(res.status) && attempt < maxRetries) {
      const ra = Number(res.headers.get("retry-after"));
      const delay = Number.isFinite(ra) && ra > 0
        ? ra * 1000
        : base * 2 ** attempt + Math.random() * base;
      await sleep(delay);
      continue;
    }
    throw new HttpError(res.status, url);
  }
}
