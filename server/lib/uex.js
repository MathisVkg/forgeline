// @ts-check
// Minimal UEX API 2.0 client (worker only). The token is read from
// UEX_TOKEN and never appears in logs or error messages.

export const UEX_BASE_URL = "https://api.uexcorp.uk/2.0/";
const TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [1_000, 4_000];

export class UexError extends Error {
  /**
   * @param {string} message
   * @param {{ resource: string, httpStatus?: number, uexStatus?: string, retryable?: boolean, cause?: unknown }} info
   */
  constructor(message, info) {
    super(message, info.cause === undefined ? undefined : { cause: info.cause });
    this.name = "UexError";
    this.resource = info.resource;
    this.httpStatus = info.httpStatus;
    this.uexStatus = info.uexStatus;
    this.retryable = info.retryable ?? false;
  }
}

/** Number of HTTP requests sent since the process started (for logs). */
export const stats = { requests: 0 };

/**
 * @typedef {object} UexOptions
 * @property {string} [token] defaults to process.env.UEX_TOKEN
 * @property {typeof fetch} [fetch]
 * @property {(ms: number) => Promise<void>} [sleep]
 * @property {string} [baseUrl]
 */

/**
 * GET a UEX resource and return the `data` member of the JSON envelope.
 * Retries twice (1 s, 4 s) on network errors, timeouts and HTTP 5xx.
 * @param {string} resource e.g. "commodities"
 * @param {Record<string, string | number>} [params]
 * @param {UexOptions} [options]
 * @returns {Promise<any>}
 */
export async function uexGet(resource, params = {}, options = {}) {
  const token = options.token ?? process.env.UEX_TOKEN ?? "";
  const doFetch = options.fetch ?? globalThis.fetch;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (!token) throw new UexError(`UEX ${resource}: UEX_TOKEN is not set`, { resource });

  const url = new URL(resource, options.baseUrl ?? UEX_BASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  for (let attempt = 0; ; attempt++) {
    try {
      return await requestOnce(resource, url, token, doFetch);
    } catch (err) {
      const safe = sanitize(err, token, resource);
      if (!safe.retryable || attempt >= RETRY_DELAYS_MS.length) throw safe;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
}

/**
 * @param {string} resource
 * @param {URL} url
 * @param {string} token
 * @param {typeof fetch} doFetch
 */
async function requestOnce(resource, url, token, doFetch) {
  stats.requests++;
  /** @type {Response} */
  let res;
  try {
    res = await doFetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new UexError(`UEX ${resource}: ${timeout ? `timeout after ${TIMEOUT_MS / 1000} s` : "network error"}`, {
      resource,
      retryable: true,
      cause: err,
    });
  }

  const text = await res.text().catch(() => "");
  /** @type {any} */
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new UexError(`UEX ${resource}: invalid JSON (HTTP ${res.status})`, {
      resource,
      httpStatus: res.status,
      retryable: res.status >= 500,
    });
  }

  const uexStatus = typeof body?.status === "string" ? body.status : undefined;
  if (uexStatus === "requests_limit_reached") {
    throw new UexError(`UEX ${resource}: requests_limit_reached (daily quota exhausted)`, {
      resource,
      httpStatus: res.status,
      uexStatus,
    });
  }
  if (!res.ok || uexStatus !== "ok") {
    const detail = typeof body?.message === "string" && body.message ? ` - ${body.message}` : "";
    throw new UexError(`UEX ${resource}: HTTP ${res.status}, status "${uexStatus ?? "?"}"${detail}`, {
      resource,
      httpStatus: res.status,
      uexStatus,
      retryable: res.status >= 500,
    });
  }
  return body.data;
}

/**
 * Makes sure the error is a UexError whose message never contains the token.
 * @param {unknown} err
 * @param {string} token
 * @param {string} resource
 * @returns {UexError}
 */
function sanitize(err, token, resource) {
  const error =
    err instanceof UexError ? err : new UexError(`UEX ${resource}: ${String(err)}`, { resource, cause: err });
  if (token && error.message.includes(token)) error.message = error.message.split(token).join("<redacted>");
  return error;
}
