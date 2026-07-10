const axios = require('axios');
const { logger } = require('@librechat/data-schemas');
const { resolveUserVKey, xctKeyExchangeEnabled } = require('@librechat/api');

/**
 * Integration with the XCity LiteLLM gateway (tokenhub.xcity.one) as an external,
 * read-only source for the Agent Marketplace and Skills board.
 *
 * Everything here is GATED behind env flags and FAIL-SAFE: any error (or a
 * disabled flag) returns an empty list so the local MongoDB-backed marketplace /
 * skills experience is never affected.
 *
 * Env:
 *   LITELLM_BASEURL          e.g. https://tokenhub.xcity.one   (trailing /v1 optional)
 *   LITELLM_API_KEY          virtual key used for chat (reused here)
 *   LITELLM_AGENTS_ENABLED   "true" to surface LiteLLM /v1/agents in the marketplace
 *   LITELLM_SKILLS_ENABLED   "true" to surface LiteLLM /v1/xct-skills in the skills board
 */

/** Normalize the configured base URL to the proxy root (no trailing slash, no /v1). */
function getBaseUrl() {
  const raw = process.env.LITELLM_BASEURL || process.env.LITELLM_AGENTS_BASEURL || '';
  return raw.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
}

function flagEnabled(name) {
  return String(process.env[name] || '').toLowerCase() === 'true';
}

function hasCredentials() {
  return !!process.env.LITELLM_API_KEY && !!getBaseUrl();
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.LITELLM_API_KEY}` };
}

const agentsEnabled = () => flagEnabled('LITELLM_AGENTS_ENABLED') && hasCredentials();
const skillsEnabled = () => flagEnabled('LITELLM_SKILLS_ENABLED') && hasCredentials();

/** Coerce various list-response envelopes into a plain array. */
function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  return payload?.data ?? payload?.agents ?? payload?.skills ?? [];
}

/**
 * Map a LiteLLM A2A agent record to the marketplace agent shape the LibreChat UI
 * renders. External agents are display-only (prefixed id, marked `_external`).
 */
function mapAgent(record) {
  const card = record?.agent_card_params || {};
  const rawId = record?.agent_id || record?.agent_name || card?.name || '';
  return {
    id: `litellm:${rawId}`,
    name: card.name || record?.agent_name || 'Agent',
    description: card.description || '',
    category: 'external',
    avatar: card.iconUrl ? { source: 'url', filepath: card.iconUrl } : null,
    authorName: 'XCity Hub',
    isPublic: true,
    provider: 'litellm',
    source: 'litellm',
    version: card.version,
    _external: true,
  };
}

function mapSkill(record) {
  const rawId = record?.skill_id || record?.id || '';
  return {
    id: `litellm:${rawId}`,
    name: record?.display_title || record?.name || 'Skill',
    description: record?.description || '',
    category: 'external',
    isPublic: true,
    source: 'litellm',
    version: record?.version,
    _external: true,
  };
}

/** Fetch public agents from the LiteLLM Agent Hub. Returns [] on any failure. */
async function fetchAgents({ search } = {}) {
  if (!agentsEnabled()) {
    return [];
  }
  try {
    const resp = await axios.get(`${getBaseUrl()}/v1/agents`, {
      headers: authHeaders(),
      params: { is_public: true, ...(search ? { q: search } : {}) },
      timeout: 8000,
    });
    return asArray(resp.data).map(mapAgent);
  } catch (err) {
    logger.warn(`[litellmSource] fetchAgents failed: ${err.message}`);
    return [];
  }
}

// Short-lived cache for the agent→model-id list. /api/models is hit on every
// app load, but the agent roster changes rarely — a 60s TTL keeps the gateway
// from being polled on each request without making the list go stale.
let agentModelIdsCache = { ids: null, expires: 0 };
const AGENT_MODEL_IDS_TTL_MS = 60 * 1000;

/**
 * Fetch public LiteLLM agents and project them to the callable model ids the
 * gateway exposes them under — `a2a/<agent_name>` (see xcity-litellm
 * agent_endpoints/a2a_routing). These are appended to the XCity AI endpoint's
 * model list so deep links like `?endpoint=XCity AI&model=a2a/xct-<slug>` from
 * xct-home resolve to a known model instead of being reset to the default.
 *
 * Gated by the same flag as the marketplace agents (LITELLM_AGENTS_ENABLED) and
 * fail-safe: returns [] on a disabled flag or any error.
 *
 * @returns {Promise<string[]>} e.g. ["a2a/xct-research", "a2a/xct-writing"]
 */
async function fetchAgentModelIds() {
  if (!agentsEnabled()) {
    return [];
  }
  const now = Date.now();
  if (agentModelIdsCache.ids && agentModelIdsCache.expires > now) {
    return agentModelIdsCache.ids;
  }
  try {
    const resp = await axios.get(`${getBaseUrl()}/v1/agents`, {
      headers: authHeaders(),
      params: { is_public: true },
      timeout: 8000,
    });
    const ids = asArray(resp.data)
      .map((record) => record?.agent_name || record?.agent_id || '')
      .filter(Boolean)
      .map((agentName) => `a2a/${agentName}`);
    agentModelIdsCache = { ids, expires: now + AGENT_MODEL_IDS_TTL_MS };
    return ids;
  } catch (err) {
    logger.warn(`[litellmSource] fetchAgentModelIds failed: ${err.message}`);
    return [];
  }
}

/** Fetch skills from the LiteLLM xct-skills registry. Returns [] on any failure. */
async function fetchSkills({ search } = {}) {
  if (!skillsEnabled()) {
    return [];
  }
  try {
    const resp = await axios.get(`${getBaseUrl()}/v1/xct-skills`, {
      headers: authHeaders(),
      params: { ...(search ? { q: search } : {}) },
      timeout: 8000,
    });
    return asArray(resp.data).map(mapSkill);
  } catch (err) {
    logger.warn(`[litellmSource] fetchSkills failed: ${err.message}`);
    return [];
  }
}

/**
 * Prepend external LiteLLM agents into a marketplace list response (mutates
 * `data.data`). First page only, and only for the "all"/"external" tabs so it
 * does not pollute curated local categories. Never throws.
 */
async function injectAgents(data, { category, search, cursor } = {}) {
  try {
    if (!agentsEnabled() || cursor) {
      return;
    }
    if (category && category !== 'all' && category !== 'external') {
      return;
    }
    const external = await fetchAgents({ search });
    if (external.length) {
      data.data = [...external, ...(data?.data ?? [])];
    }
  } catch (err) {
    logger.warn(`[litellmSource] injectAgents error: ${err.message}`);
  }
}

/** Append external LiteLLM skills into a skills list response. Never throws. */
async function injectSkills(data, { search, cursor } = {}) {
  try {
    if (!skillsEnabled() || cursor) {
      return;
    }
    const external = await fetchSkills({ search });
    if (external.length) {
      data.data = [...external, ...(data?.data ?? [])];
    }
  } catch (err) {
    logger.warn(`[litellmSource] injectSkills error: ${err.message}`);
  }
}

const publishEnabled = () => flagEnabled('LITELLM_PUBLISH_ENABLED') && hasCredentials();

/**
 * Publish-sync: push a LibreChat-built agent to the tokenhub registry so it
 * surfaces in xct-home's marketplace as a *community* agent owned by the
 * publishing user.
 *
 * Ownership: the registry records `created_by` from the calling key's
 * user_id, so publication MUST use the user's own gateway vkey (XCT key
 * exchange) — the shared service key would register the agent under the
 * service identity and break "my agents" / owner re-publish. Requires the
 * gateway's AGENT_REGISTRY_ALLOW_USER_WRITES flag.
 *
 * Republish is an update-in-place: the registry name `xct-<agent id>` is
 * stable, so we look up the caller-visible agent by name and PUT when it
 * already exists.
 *
 * Same contract as everything else in this module — gated
 * (LITELLM_PUBLISH_ENABLED) and fail-safe: never throws, returns
 * `{ published: false, reason }` on any problem.
 *
 * @param {object} agent - LibreChat agent document (id, name, description,
 *   category, model, tools).
 * @param {object} [options]
 * @param {ServerRequest} [options.req] - request carrying the publishing user.
 * @returns {Promise<{published: boolean, agent_id?: string, reason?: string}>}
 */
async function publishAgent(agent, { req } = {}) {
  if (!publishEnabled()) {
    return { published: false, reason: 'disabled' };
  }
  if (!agent?.id || !agent?.name) {
    return { published: false, reason: 'invalid_agent' };
  }
  const userKey = xctKeyExchangeEnabled() && req?.user ? await resolveUserVKey(req.user) : null;
  if (!userKey) {
    return { published: false, reason: 'no_user_key' };
  }
  try {
    const headers = { Authorization: `Bearer ${userKey}` };
    const agentName = `xct-${agent.id}`;
    const authorName =
      req.user?.name || req.user?.username || (req.user?.email || '').split('@')[0] || 'Xcity user';
    // A2A-style agent card; the category leads the skill list so xct-home's
    // category derivation (first skill tag) lands on it, and provider carries
    // the display author for the community badge.
    const skills = [
      ...(agent.category
        ? [
            {
              id: `category:${agent.category}`,
              name: agent.category,
              description: 'Marketplace category',
              tags: [agent.category],
            },
          ]
        : []),
      ...(agent.model
        ? [
            {
              id: `model:${agent.model}`,
              name: agent.model,
              description: 'Driving model',
              tags: ['model'],
            },
          ]
        : []),
      ...(agent.tools ?? []).map((tool) => ({
        id: `tool:${tool}`,
        name: tool,
        description: 'Agent tool',
        tags: ['tool'],
      })),
    ];
    const body = {
      agent_name: agentName,
      agent_card_params: {
        name: agent.name,
        description: agent.description || '',
        provider: { organization: authorName },
        skills,
      },
      litellm_params: { make_public: true },
    };
    const list = await axios.get(`${getBaseUrl()}/v1/agents`, { headers, timeout: 8000 });
    const existing = asArray(list.data).find((record) => record?.agent_name === agentName);
    const resp = existing?.agent_id
      ? await axios.put(`${getBaseUrl()}/v1/agents/${existing.agent_id}`, body, {
          headers,
          timeout: 8000,
        })
      : await axios.post(`${getBaseUrl()}/v1/agents`, body, { headers, timeout: 8000 });
    const agentId = resp?.data?.agent_id || resp?.data?.id || existing?.agent_id || agentName;
    logger.info(`[litellmSource] published agent ${agent.id} → ${agentId}`);
    return { published: true, agent_id: agentId };
  } catch (err) {
    logger.warn(`[litellmSource] publishAgent failed: ${err.message}`);
    return { published: false, reason: err.message };
  }
}

module.exports = {
  agentsEnabled,
  skillsEnabled,
  publishEnabled,
  fetchAgents,
  fetchAgentModelIds,
  fetchSkills,
  injectAgents,
  injectSkills,
  publishAgent,
};
