/**
 * Spike 002: provider authentication contracts and Ingress-safe browser flow.
 *
 * This module deliberately has no network, process, filesystem, or credential
 * dependencies. It is a fixture-driven contract prototype for the future
 * backend adapter. Secret values are accepted only to prove redaction and are
 * never returned by the state machine.
 */

export const CODEX_DEVICE_URL_HOSTS = new Set(["auth.openai.com"]);
export const CURSOR_LOGIN_METHOD = "cursor_login";

export const AUTH_STATES = Object.freeze({
  unknown: "unknown",
  unauthenticated: "unauthenticated",
  loginRequired: "login_required",
  loginInProgress: "login_in_progress",
  waitingForBrowser: "waiting_for_browser",
  authenticated: "authenticated",
  expiring: "expiring",
  expired: "expired",
  revoked: "revoked",
  cancelled: "cancelled",
  failed: "failed",
  loggedOut: "logged_out",
});

const SECRET_KEY = /^(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|code|usercode|loginid)$/i;
const API_KEY = /\b(?:sk|rk|sess|key)_[A-Za-z0-9_-]{8,}\b/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/**
 * Redact arbitrary diagnostic data without attempting to parse or retain a
 * provider token. Query strings are always removed from URLs in diagnostics.
 */
export function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    let result = value.replace(BEARER, "Bearer [REDACTED]");
    result = result.replace(API_KEY, "[REDACTED]");
    result = result.replace(JWT, "[REDACTED]");
    if (/^https?:\/\//i.test(result)) {
      try {
        const url = new URL(result);
        return `${url.protocol}//${url.host}${url.pathname}`;
      } catch {
        return "[REDACTED_URL]";
      }
    }
    return result;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, key));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redact(childValue, childKey),
      ]),
    );
  }
  return value;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse the ACP initialize response. Unknown methods remain visible as
 * unsupported metadata so a later ACP extension is not mistaken for a known
 * login path.
 */
export function parseAuthMethods(initializeResponse, { urlElicitation = true } = {}) {
  const methods = initializeResponse?.result?.authMethods;
  if (!Array.isArray(methods)) {
    return { methods: [], error: "missing_auth_methods" };
  }

  const parsed = methods
    .filter(isObject)
    .map((method) => {
      const id = typeof method.id === "string" ? method.id : "unknown";
      if (id === "api-key") {
        return {
          id,
          kind: "secret_input",
          supported: true,
          browserRequired: false,
          label: method.name ?? "API key",
        };
      }
      if (id === "chat-gpt-device-code") {
        return {
          id,
          kind: "url_elicitation",
          supported: urlElicitation,
          browserRequired: true,
          label: method.name ?? "ChatGPT (device code)",
          reason: urlElicitation ? undefined : "client_does_not_support_url_elicitation",
        };
      }
      if (id === "chat-gpt") {
        return {
          id,
          kind: "local_callback",
          // The callback is localhost in the Codex process. It is not an
          // Ingress callback and therefore is intentionally not a supported
          // remote-browser path in this spike.
          supported: false,
          browserRequired: true,
          label: method.name ?? "ChatGPT",
          reason: "localhost_callback_not_ingress_safe",
        };
      }
      if (id === CURSOR_LOGIN_METHOD) {
        return {
          id,
          kind: "provider_bootstrap",
          supported: true,
          browserRequired: true,
          label: method.name ?? "Cursor login",
        };
      }
      return {
        id,
        kind: "unknown",
        supported: false,
        browserRequired: undefined,
        label: method.name ?? id,
        reason: "unknown_auth_method",
      };
    });

  return { methods: parsed, error: undefined };
}

/**
 * Describe the browser/backend choreography selected by the adapter. This is
 * a UI contract, not an executor: secrets and provider RPC objects stay in
 * the backend process and only public display data crosses to the browser.
 */
export function authFlowPlan(provider, method) {
  if (provider === "codex" && method === "chat-gpt-device-code") {
    return {
      provider,
      method,
      backend: [
        "start_acp_authenticate",
        "parse_device_code",
        "await_login_completion",
        "read_account_status",
      ],
      ui: ["show_verified_external_url", "show_one_time_code", "allow_cancel"],
      credentialTransport: "provider_persistence_only",
    };
  }
  if (provider === "codex" && method === "chat-gpt") {
    return {
      provider,
      method,
      supported: false,
      reason: "localhost_callback_not_ingress_safe",
    };
  }
  if (provider === "codex" && method === "api-key") {
    return {
      provider,
      method,
      backend: ["accept_write_only_secret", "launch_isolated_provider", "read_account_status"],
      ui: ["show_secret_input", "show_status_only", "allow_logout"],
      credentialTransport: "provider_process_environment",
      verification: "structural_only",
    };
  }
  if (provider === "cursor" && method === CURSOR_LOGIN_METHOD) {
    return {
      provider,
      method,
      backend: [
        "launch_isolated_login_bootstrap",
        "parse_display_url",
        "await_process_status",
        "launch_native_acp",
      ],
      ui: ["show_verified_external_url", "allow_cancel", "show_status_only"],
      credentialTransport: "provider_persistence_only",
    };
  }
  return {
    provider,
    method,
    supported: false,
    reason: "unsupported_auth_flow",
  };
}

function safeExternalUrl(rawUrl, allowedHosts) {
  if (typeof rawUrl !== "string") throw new Error("missing_url");
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("url_must_use_https");
  if (!allowedHosts.has(url.hostname)) throw new Error("url_host_not_allowed");
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/** Parse Codex's chatgptDeviceCode response without persisting secrets. */
export function parseCodexDeviceCodeResponse(response) {
  const result = response?.result ?? response;
  if (!isObject(result) || result.type !== "chatgptDeviceCode") {
    throw new Error("not_device_code_response");
  }
  if (typeof result.loginId !== "string" || result.loginId.length < 8) {
    throw new Error("missing_login_id");
  }
  const displayUrl = safeExternalUrl(result.verificationUrl, CODEX_DEVICE_URL_HOSTS);
  if (typeof result.userCode !== "string" || result.userCode.trim() === "") {
    throw new Error("missing_user_code");
  }
  return {
    loginId: result.loginId,
    displayUrl,
    userCode: result.userCode.trim(),
    // Keep the raw URL/code only in the active process; callers must not put
    // this object into durable event rows or logs.
    persist: false,
  };
}

/**
 * Cursor login output is intentionally parsed conservatively. The CLI's
 * browser-disabled path prints a URL, while status output is the durable
 * source of truth after restart.
 */
export function parseCursorLoginOutput(text) {
  if (typeof text !== "string") return { state: AUTH_STATES.unknown };
  if (/not logged in/i.test(text)) {
    return { state: AUTH_STATES.unauthenticated };
  }
  const url = text.match(/https:\/\/[^\s]+/i)?.[0];
  if (/waiting for browser|open a browser|authentication/i.test(text) && url) {
    return {
      state: AUTH_STATES.waitingForBrowser,
      displayUrl: redact(url),
      persist: false,
    };
  }
  if (/logged in as|login successful|authentication tokens stored securely/i.test(text)) {
    return { state: AUTH_STATES.authenticated };
  }
  if (/timed out|login failed|failed to store|login error/i.test(text)) {
    return { state: AUTH_STATES.failed, error: "provider_login_failed" };
  }
  return { state: AUTH_STATES.unknown };
}

/**
 * Build browser URLs relative to Home Assistant's ingress mount. The caller
 * should obtain ingressPath from a trusted backend-derived value (normally
 * Supervisor's X-Ingress-Path), never from arbitrary browser input.
 */
export function buildIngressUrl(origin, ingressPath, relativePath = "/") {
  const base = new URL(origin);
  if (!/^https?:$/.test(base.protocol)) throw new Error("invalid_origin");
  if (typeof ingressPath !== "string" || !ingressPath.startsWith("/")) {
    throw new Error("invalid_ingress_path");
  }
  if (!relativePath.startsWith("/")) throw new Error("relative_path_required");
  const normalizedBase = ingressPath.replace(/\/+$/, "");
  return new URL(`${normalizedBase}${relativePath}`, base).toString();
}

export function buildWebSocketUrl(origin, ingressPath, relativePath = "/api/ws") {
  const httpUrl = buildIngressUrl(origin, ingressPath, relativePath);
  const url = new URL(httpUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function accountState(account) {
  if (!account) return AUTH_STATES.unauthenticated;
  if (account.type === "chatgpt" || account.type === "apiKey") {
    return AUTH_STATES.authenticated;
  }
  return AUTH_STATES.unknown;
}

function publicAccount(account) {
  if (!isObject(account)) return null;
  return {
    type: typeof account.type === "string" ? account.type : "unknown",
    // Email/plan are provider metadata, not credentials; keep them optional
    // and never copy unknown fields that might contain a token.
    ...(typeof account.email === "string" ? { email: account.email } : {}),
    ...(typeof account.planType === "string" ? { planType: account.planType } : {}),
  };
}

/**
 * Minimal provider-neutral auth state machine. It correlates login completion
 * to the active loginId, rejects stale completions, and emits only public
 * state suitable for the browser projection.
 */
export class AuthStateMachine {
  constructor(provider) {
    this.provider = provider;
    this.state = AUTH_STATES.unknown;
    this.activeLoginId = null;
    this.loginActive = false;
    this.account = null;
    this.error = null;
    this.method = null;
  }

  snapshot() {
    return {
      provider: this.provider,
      state: this.state,
      method: this.method,
      account: this.account,
      error: this.error,
      loginInProgress: this.loginActive,
    };
  }

  initialize() {
    this.state = AUTH_STATES.unknown;
    this.error = null;
    return this.snapshot();
  }

  authRequired() {
    this.state = AUTH_STATES.loginRequired;
    this.error = null;
    return this.snapshot();
  }

  startLogin({ method, loginId = null } = {}) {
    if (this.loginActive) throw new Error("login_already_in_progress");
    this.method = method ?? null;
    this.activeLoginId = loginId;
    this.loginActive = true;
    this.state = method === "chat-gpt-device-code" || method === CURSOR_LOGIN_METHOD
      ? AUTH_STATES.waitingForBrowser
      : AUTH_STATES.loginInProgress;
    this.error = null;
    return this.snapshot();
  }

  acceptExternalLogin(loginId) {
    if (!this.loginActive || this.activeLoginId !== loginId) throw new Error("stale_login_id");
    this.state = AUTH_STATES.loginInProgress;
    return this.snapshot();
  }

  completeLogin({ loginId = null, success, error = null } = {}) {
    if (!this.loginActive || this.activeLoginId !== loginId) {
      return { ...this.snapshot(), ignored: true, reason: "stale_login_completion" };
    }
    this.activeLoginId = null;
    this.loginActive = false;
    this.state = success ? AUTH_STATES.authenticated : AUTH_STATES.failed;
    this.error = success ? null : redact(error ?? "provider_login_failed");
    return this.snapshot();
  }

  accountUpdated({ authMode, planType = null } = {}) {
    if (authMode === "chatgpt") {
      this.account = { type: "chatgpt", ...(planType ? { planType } : {}) };
      this.state = AUTH_STATES.authenticated;
    } else if (authMode === "apikey" || authMode === "apiKey") {
      this.account = { type: "apiKey" };
      this.state = AUTH_STATES.authenticated;
    } else if (authMode === null) {
      this.account = null;
      this.state = AUTH_STATES.loggedOut;
    }
    return this.snapshot();
  }

  markExpiring() {
    if (this.state === AUTH_STATES.authenticated) this.state = AUTH_STATES.expiring;
    return this.snapshot();
  }

  accountRead(response, { refreshed = false } = {}) {
    const result = response?.result ?? response;
    if (!isObject(result)) {
      this.state = AUTH_STATES.failed;
      this.error = "invalid_account_response";
      return this.snapshot();
    }
    if (result.account) {
      this.account = publicAccount(result.account);
      this.state = accountState(result.account);
      this.error = null;
      return this.snapshot();
    }
    this.account = null;
    this.state = result.requiresOpenaiAuth ? AUTH_STATES.loginRequired : AUTH_STATES.unauthenticated;
    this.error = refreshed && result.requiresOpenaiAuth ? "refresh_not_available" : null;
    return this.snapshot();
  }

  refreshError(error, kind = "expired") {
    this.state = kind === "revoked" ? AUTH_STATES.revoked : AUTH_STATES.expired;
    this.error = redact(error ?? kind);
    this.activeLoginId = null;
    this.loginActive = false;
    return this.snapshot();
  }

  cancelLogin(loginId) {
    if (this.activeLoginId !== loginId) {
      return { ...this.snapshot(), ignored: true, reason: "stale_login_cancel" };
    }
    this.activeLoginId = null;
    this.loginActive = false;
    this.state = AUTH_STATES.cancelled;
    return this.snapshot();
  }

  logoutCompleted() {
    this.activeLoginId = null;
    this.loginActive = false;
    this.account = null;
    this.state = AUTH_STATES.loggedOut;
    this.error = null;
    return this.snapshot();
  }

  processExited(error = "provider_process_exited") {
    if (this.state === AUTH_STATES.authenticated) {
      this.state = AUTH_STATES.failed;
    }
    this.error = redact(error);
    this.activeLoginId = null;
    this.loginActive = false;
    return this.snapshot();
  }
}

/**
 * Return the only credential-bearing process environment entries allowed by
 * the adapters. The caller must create a dedicated provider process and never
 * put this object in an event, URL, argv, or browser response.
 */
export function credentialEnvironment(provider, secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("empty_credential");
  }
  if (provider === "codex") return { CODEX_API_KEY: secret };
  if (provider === "cursor") return { CURSOR_API_KEY: secret };
  throw new Error("unknown_provider");
}
