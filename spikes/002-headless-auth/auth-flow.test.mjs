import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_STATES,
  AuthStateMachine,
  authFlowPlan,
  buildIngressUrl,
  buildWebSocketUrl,
  credentialEnvironment,
  parseAuthMethods,
  parseCodexDeviceCodeResponse,
  parseCursorLoginOutput,
  redact,
} from "./auth-flow.mjs";

const codexInitialize = {
  result: {
    authMethods: [
      { id: "api-key", name: "API Key" },
      { id: "chat-gpt", name: "ChatGPT" },
      { id: "chat-gpt-device-code", name: "ChatGPT (device code)" },
      { id: "future-provider", name: "Future provider" },
    ],
  },
};

test("Codex auth methods keep device-code support and reject localhost browser path", () => {
  const result = parseAuthMethods(codexInitialize, { urlElicitation: true });
  assert.deepEqual(result.methods.map((method) => [method.id, method.supported]), [
    ["api-key", true],
    ["chat-gpt", false],
    ["chat-gpt-device-code", true],
    ["future-provider", false],
  ]);
});

test("device-code response is parsed for display and marked non-persistent", () => {
  const result = parseCodexDeviceCodeResponse({
    result: {
      type: "chatgptDeviceCode",
      loginId: "login-12345678",
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-1234",
    },
  });
  assert.deepEqual(result, {
    loginId: "login-12345678",
    displayUrl: "https://auth.openai.com/codex/device",
    userCode: "ABCD-1234",
    persist: false,
  });
});

test("auth flow plans separate backend actions from public UI actions", () => {
  const plan = authFlowPlan("codex", "chat-gpt-device-code");
  assert.deepEqual(plan.ui, ["show_verified_external_url", "show_one_time_code", "allow_cancel"]);
  assert.equal(plan.credentialTransport, "provider_persistence_only");
  assert.equal(authFlowPlan("codex", "chat-gpt").supported, false);
  assert.equal(authFlowPlan("codex", "api-key").verification, "structural_only");
  assert.equal(authFlowPlan("cursor", "cursor_login").backend.at(-1), "launch_native_acp");
});

test("device-code URL validation blocks lookalike and non-HTTPS hosts", () => {
  for (const verificationUrl of [
    "http://auth.openai.com/codex/device",
    "https://auth.openai.com.evil.example/codex/device",
    "https://evil.example/codex/device",
  ]) {
    assert.throws(() => parseCodexDeviceCodeResponse({
      result: {
        type: "chatgptDeviceCode",
        loginId: "login-12345678",
        verificationUrl,
        userCode: "ABCD-1234",
      },
    }));
  }
});

test("Cursor browser-disabled output is status-only and non-persistent", () => {
  assert.deepEqual(parseCursorLoginOutput("Not logged in"), {
    state: AUTH_STATES.unauthenticated,
  });
  assert.deepEqual(parseCursorLoginOutput(
    "Waiting for browser authentication... Open a browser and navigate to this link: https://cursor.com/login",
  ), {
    state: AUTH_STATES.waitingForBrowser,
    displayUrl: "https://cursor.com/login",
    persist: false,
  });
  assert.deepEqual(parseCursorLoginOutput("Authentication tokens stored securely."), {
    state: AUTH_STATES.authenticated,
  });
});

test("Ingress path is preserved for HTTP and WebSocket requests", () => {
  assert.equal(
    buildIngressUrl("https://ha.example", "/api/hass-conx/", "/api/bootstrap"),
    "https://ha.example/api/hass-conx/api/bootstrap",
  );
  assert.equal(
    buildWebSocketUrl("https://ha.example", "/api/hass-conx/", "/api/ws"),
    "wss://ha.example/api/hass-conx/api/ws",
  );
  assert.throws(() => buildIngressUrl("https://ha.example", "https://evil.example", "/api"));
  assert.throws(() => buildIngressUrl("https://ha.example", "/api/app", "api"));
});

test("state machine correlates completion and rejects stale login events", () => {
  const auth = new AuthStateMachine("codex");
  auth.initialize();
  auth.authRequired();
  auth.startLogin({ method: "chat-gpt-device-code", loginId: "login-a" });
  auth.acceptExternalLogin("login-a");
  assert.equal(auth.completeLogin({ loginId: "login-stale", success: true }).ignored, true);
  assert.equal(auth.snapshot().state, AUTH_STATES.loginInProgress);
  auth.completeLogin({ loginId: "login-a", success: true });
  auth.accountUpdated({ authMode: "chatgpt", planType: "plus" });
  assert.deepEqual(auth.snapshot().account, { type: "chatgpt", planType: "plus" });
  auth.logoutCompleted();
  assert.equal(auth.snapshot().state, AUTH_STATES.loggedOut);
});

test("refresh and cancellation states are explicit", () => {
  const auth = new AuthStateMachine("codex");
  auth.accountUpdated({ authMode: "chatgpt" });
  auth.markExpiring();
  assert.equal(auth.snapshot().state, AUTH_STATES.expiring);
  auth.startLogin({ method: "chat-gpt-device-code", loginId: "login-b" });
  auth.cancelLogin("login-b");
  assert.equal(auth.snapshot().state, AUTH_STATES.cancelled);
  auth.refreshError("refresh token revoked", "revoked");
  assert.equal(auth.snapshot().state, AUTH_STATES.revoked);
});

test("credential environment is provider-specific and secret values are redacted", () => {
  assert.deepEqual(credentialEnvironment("codex", "sk-test-secret-value"), {
    CODEX_API_KEY: "sk-test-secret-value",
  });
  assert.deepEqual(credentialEnvironment("cursor", "cursor-secret-value"), {
    CURSOR_API_KEY: "cursor-secret-value",
  });
  assert.equal(redact({ apiKey: "sk-test-secret-value", url: "https://x.test/path?token=secret" }).apiKey, "[REDACTED]");
  assert.equal(redact({ apiKey: "sk-test-secret-value", url: "https://x.test/path?token=secret" }).url, "https://x.test/path");
  assert.equal(redact("Authorization: Bearer abc.def.ghi"), "Authorization: Bearer [REDACTED]");
});
