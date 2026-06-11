# FORK-CHANGES — xct-chat deviations from upstream LibreChat

Registry of every functional change this fork carries on top of upstream
LibreChat (`v0.8.6`). Keep this current: each entry lists the touched files
so upstream merges know exactly where conflicts are expected and how to
re-verify. Config-only additions (librechat.yaml, env templates, docs) are
listed at the bottom — they never conflict.

## Code changes

### 1. Per-user LiteLLM virtual-key exchange (XCT key exchange)

LibreChat custom endpoints use one shared API key; for the `XCity AI`
endpoint (tokenhub.xcity.one) that bypasses per-plan budgets/RPM and bills
everyone to one key. The fork swaps in the user's own virtual key, exchanged
from xct-wallet (`POST /v1/keys/for-user`) using the GoTrue uuid carried in
`user.openidId`, cached in-process for 60s, and **fail-safe**: any wallet
error falls back to the shared key.

- `packages/api/src/endpoints/custom/xctKeyExchange.ts` — new module (no
  upstream conflicts).
- `packages/api/src/endpoints/custom/xctKeyExchange.spec.ts` — tests.
- `packages/api/src/endpoints/custom/initialize.ts` — **one hook**: after
  apiKey resolution, `if (xctKeyExchangeEnabled() && isXctEndpoint(endpoint))`
  swap `apiKey`. On upstream merge, re-apply this block if `initialize.ts`
  changed; the spec (`initialize.spec.ts`, "XCT per-user vkey exchange"
  describe block) fails loudly if the hook is lost.

Env (all required to activate; absent = upstream behavior):
`XCT_KEY_EXCHANGE_ENABLED=true`, `WALLET_BASE_URL`, `WALLET_SERVICE_TOKEN`,
optional `XCT_ENDPOINT_NAME` (default `XCity AI`).

### 2. LiteLLM Hub marketplace/skills source + agent publish-sync

`api/server/services/litellmSource.js` —
- Read-only surfacing of LiteLLM `/v1/agents` and `/v1/xct-skills` in the
  Agent Marketplace / Skills board. Gated behind `LITELLM_AGENTS_ENABLED` /
  `LITELLM_SKILLS_ENABLED`, fail-safe empty lists.
- `publishAgent(agent)` (P4 publish-sync): pushes a LibreChat-built agent to
  the tokenhub registry (`POST /v1/agents`, A2A agent card with the resource
  composition encoded as skills) so it surfaces in xct-home's catalog. Gated
  behind `LITELLM_PUBLISH_ENABLED`, fail-safe `{published:false, reason}`.
  Tests: `litellmSource.spec.js`. UI trigger not wired yet (product decision:
  auto-publish on share vs. review queue).

## Pending (contract ready, needs live-gateway verification)

- **Per-request `metadata.xct_agent_id` injection** (P3 agent-dimension
  billing): the wallet (`usage_events.agent_id`) and the LiteLLM callback
  (`xcity_callback._extract_agent_id`) already accept it. The chat side
  needs a verified injection point in the LangChain request path
  (candidates: `modelKwargs.metadata` via `getOpenAIConfig`, or LiteLLM's
  `x-litellm-*` metadata headers on the custom endpoint). Verify against a
  live tokenhub before wiring — body-shape assumptions differ per LiteLLM
  version. Until then, agent spend is attributed per-user (vkey) but not
  per-agent from chat.

## Config / docs (no upstream conflict risk)

- `librechat.yaml` — `XCity AI` custom endpoint (tokenhub, `fetch: true`),
  agents capabilities, MCP servers wired **through the gateway only** (never
  direct — permissions + billing must flow through tokenhub).
- `railway.env.template` — OpenID (auth.xcity.one), `ALLOW_REGISTRATION=false`,
  LiteLLM + XCT key-exchange variables.
- `OPENID-DEPLOYMENT-GUIDE.md`, `XCT-LITELLM-INTEGRATION.md`,
  `XCT-AUTH-CHAT-INTEGRATION.md` — deployment runbooks.

## Merge checklist

1. `npx jest src/endpoints/custom/ --coverage=false` in `packages/api` — the
   fork describe blocks must pass.
2. Grep for `xctKeyExchange` in `initialize.ts` — hook present.
3. `librechat.yaml` endpoint name still matches `XCT_ENDPOINT_NAME` default
   and the xct-home deep-link (`/c/new?endpoint=XCity%20AI&model=…`).
