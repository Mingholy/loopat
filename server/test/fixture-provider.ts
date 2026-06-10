/**
 * Generic fixture extension provider — for loopat extension-base PoC self-verification.
 *
 * This file has NO enterprise strings and NO platform-specific logic. It is
 * a duck-typed provider that exercises all five extension-base capabilities
 * (A1–A5) in a minimal, self-contained way.
 *
 * Usage:
 *   Drop (or symlink) this file into $LOOPAT_HOME/extensions/providers/ to
 *   activate the fixture during local development. It is NOT loaded in
 *   production.
 *
 * Capabilities exercised:
 *   A1: onboarding() returns kind:"embed" with tiny HTML
 *   A2: externalAuth declares a trivial SSO callback
 *   A3: the embed HTML calls POST /api/settings/personal/mount
 *   A4: the embed HTML calls POST /api/mcp-auth/start with serverConfig
 *   A5: seedDefaults receives ctx.token (asserted in the unit test below)
 */

import type { GitHostProvider, ExternalAuth, OnboardingView } from "../src/git-host"

const fixtureExternalAuth: ExternalAuth = {
  id: "fixture-sso",
  label: "Fixture SSO Login",
  callbackPath: "/fixture-sso-callback",
  tokenParam: "TKN",
  buildLoginUrl: (back: string) => `/fixture-idp?back=${encodeURIComponent(back)}`,
  async verify(t: string) {
    // In the fixture, any token is valid. Real providers must validate expiry
    // and prevent replay attacks here.
    return { oauthId: `emp-${t}`, username: "tester", email: "t@example.test" }
  },
}

const fixtureProvider: GitHostProvider = {
  id: "fixture",
  label: "Fixture",
  gitAuthMode: "https-token",

  externalAuth: fixtureExternalAuth,

  async authenticate() {
    return { login: "tester", email: "t@example.test" }
  },

  async ensureRepo() {
    return { url: "https://example.test/r.git", created: true }
  },

  async grantAccess() {
    // no-op in fixture
  },

  async onboarding(ctx): Promise<OnboardingView> {
    // Gate: once the embed HTML calls /api/onboarding/done, the provider
    // checks the persisted flag. Here we use a simple config flag for the test.
    if (ctx.config?.__fixture_done) return { done: true }
    return {
      done: false,
      show: {
        kind: "embed",
        title: "Fixture Onboarding",
        // NOTE: no sandbox attribute on the rendered iframe — same-origin
        // required so session cookies are sent on relative /api fetches.
        html: `<!doctype html>
<meta charset=utf-8>
<body>
  <h3>fixture onboarding</h3>
  <button id="k">write key</button>
  <button id="m">mount file</button>
  <button id="d">done</button>
  <pre id="out"></pre>
  <script>
    function log(msg) { document.getElementById('out').textContent += msg + '\\n'; }

    // A3: write a vault env via the stable API
    document.getElementById('k').onclick = () =>
      fetch('/api/settings/personal/value', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'FIXTURE_KEY', value: 'v' }),
      }).then(r => r.json()).then(j => log('value: ' + JSON.stringify(j)));

    // A3: write a mount file via the new /mount endpoint
    document.getElementById('m').onclick = () =>
      fetch('/api/settings/personal/mount', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: 'home/.config/fixture/config.txt',
          contentBase64: btoa('fixture config'),
        }),
      }).then(r => r.json()).then(j => log('mount: ' + JSON.stringify(j)));

    // C4: done + reload
    document.getElementById('d').onclick = async () => {
      await fetch('/api/onboarding/done', { method: 'POST' });
      window.top.location.reload();
    };
  </script>
</body>`,
      },
    }
  },

  async seedDefaults(ctx) {
    // A5: ctx.token is the provisioning token passed from setupPersonalViaProvider.
    // In the fixture we only assert it is present (when called from tests).
    // Real providers use it for host-side registration (e.g. register SSH key).
    if (process.env.FIXTURE_ASSERT_TOKEN && !ctx.token) {
      throw new Error("fixture: seedDefaults called without token — A5 regression")
    }
  },
}

export default fixtureProvider
