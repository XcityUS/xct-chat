/**
 * XCT fork — LiteLLM Hub integration (FORK-CHANGES.md §2).
 *
 * publishAgent: P4 publish-sync — push a LibreChat-built agent to the
 * tokenhub registry (/v1/agents) so it appears in xct-home's catalog and
 * becomes a platform-wide consumption unit. Gated + fail-safe like every
 * other function in this module.
 */

jest.mock('axios');
// litellmSource pulls resolveUserVKey from @librechat/api; mock it so the
// real bundle (which builds an axios instance at import time, incompatible
// with the module mock above) never loads.
jest.mock('@librechat/api', () => ({
  resolveUserVKey: jest.fn(),
  xctKeyExchangeEnabled: jest.fn(),
}));
const axios = require('axios');
const { resolveUserVKey, xctKeyExchangeEnabled } = require('@librechat/api');

const ORIGINAL_ENV = { ...process.env };

function enablePublish() {
  process.env.LITELLM_PUBLISH_ENABLED = 'true';
  process.env.LITELLM_BASEURL = 'https://tokenhub.test';
  process.env.LITELLM_API_KEY = 'sk-svc';
}

const AGENT_DOC = {
  id: 'agent_abc123',
  name: '🌐 Translator',
  description: 'Translates anything.',
  instructions: 'You translate.',
  provider: 'XCity AI',
  model: 'deepseek-v4-flash',
  tools: ['web_search'],
};

// litellmSource reads env at call time — no module reset needed, so the
// axios mock instance stays shared between the module and this spec.
const { publishAgent } = require('./litellmSource');

describe('litellmSource.publishAgent', () => {
  const REQ = { user: { id: 'u1', name: 'Alice', openidId: 'sub-1', email: 'alice@x.com' } };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LITELLM_PUBLISH_ENABLED;
    process.env.LITELLM_BASEURL = 'https://tokenhub.test';
    process.env.LITELLM_API_KEY = 'sk-svc';
    xctKeyExchangeEnabled.mockReturnValue(true);
    resolveUserVKey.mockResolvedValue('sk-user');
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('is disabled by default (no gateway call)', async () => {
    const result = await publishAgent(AGENT_DOC, { req: REQ });
    expect(result).toMatchObject({ published: false, reason: 'disabled' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('requires the user vkey — the shared key must never own a publication', async () => {
    enablePublish();
    resolveUserVKey.mockResolvedValue(null);
    const result = await publishAgent(AGENT_DOC, { req: REQ });
    expect(result).toMatchObject({ published: false, reason: 'no_user_key' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('POSTs a new agent card with the user vkey and author provider', async () => {
    enablePublish();
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockResolvedValue({ data: { agent_id: 'uuid-new' } });

    const result = await publishAgent(AGENT_DOC, { req: REQ });

    expect(result).toMatchObject({ published: true, agent_id: 'uuid-new' });
    expect(axios.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://tokenhub.test/v1/agents');
    expect(config.headers.Authorization).toBe('Bearer sk-user');
    expect(body.agent_name).toBe('xct-agent_abc123');
    expect(body.litellm_params).toEqual({ make_public: true });
    expect(body.agent_card_params).toMatchObject({
      name: '🌐 Translator',
      description: 'Translates anything.',
      provider: { organization: 'Alice' },
    });
    // Resource composition rides along so the registry knows what the
    // agent is made of (model + tools).
    expect(body.agent_card_params.skills).toEqual([
      expect.objectContaining({ id: 'model:deepseek-v4-flash' }),
      expect.objectContaining({ id: 'tool:web_search' }),
    ]);
  });

  it('leads the skill list with the category so xct-home derives it', async () => {
    enablePublish();
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockResolvedValue({ data: { agent_id: 'uuid-new' } });

    await publishAgent({ ...AGENT_DOC, category: 'translation' }, { req: REQ });

    const [, body] = axios.post.mock.calls[0];
    expect(body.agent_card_params.skills[0]).toMatchObject({
      id: 'category:translation',
      tags: ['translation'],
    });
  });

  it('republish updates the existing registry entry in place (PUT)', async () => {
    enablePublish();
    axios.get.mockResolvedValue({
      data: [{ agent_name: 'xct-agent_abc123', agent_id: 'uuid-1' }],
    });
    axios.put.mockResolvedValue({ data: { agent_id: 'uuid-1' } });

    const result = await publishAgent(AGENT_DOC, { req: REQ });

    expect(result).toMatchObject({ published: true, agent_id: 'uuid-1' });
    expect(axios.post).not.toHaveBeenCalled();
    const [url, , config] = axios.put.mock.calls[0];
    expect(url).toBe('https://tokenhub.test/v1/agents/uuid-1');
    expect(config.headers.Authorization).toBe('Bearer sk-user');
  });

  it('returns published:false on gateway errors instead of throwing', async () => {
    enablePublish();
    axios.get.mockResolvedValue({ data: [] });
    axios.post.mockRejectedValue(new Error('503 from gateway'));

    const result = await publishAgent(AGENT_DOC, { req: REQ });
    expect(result.published).toBe(false);
    expect(result.reason).toContain('503');
  });

  it('rejects agents without an id or name', async () => {
    enablePublish();
    const result = await publishAgent({ description: 'nameless' }, { req: REQ });
    expect(result).toMatchObject({ published: false, reason: 'invalid_agent' });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('litellmSource.fetchAgentModelIds', () => {
  let freshAxios;
  let fetchAgentModelIds;

  // The module caches the id list for 60s, so re-require a fresh module (and a
  // fresh axios automock) per test to keep cases independent.
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    process.env.LITELLM_BASEURL = 'https://tokenhub.test';
    process.env.LITELLM_API_KEY = 'sk-svc';
    delete process.env.LITELLM_AGENTS_ENABLED;
    freshAxios = require('axios');
    ({ fetchAgentModelIds } = require('./litellmSource'));
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('is disabled by default (no gateway call)', async () => {
    const ids = await fetchAgentModelIds();
    expect(ids).toEqual([]);
    expect(freshAxios.get).not.toHaveBeenCalled();
  });

  it('maps public agents to a2a/<agent_name> model ids when enabled', async () => {
    process.env.LITELLM_AGENTS_ENABLED = 'true';
    freshAxios.get.mockResolvedValue({
      data: [
        { agent_name: 'xct-research', agent_id: 'a1' },
        { agent_name: 'xct-writing', agent_id: 'a2' },
      ],
    });

    const ids = await fetchAgentModelIds();

    expect(ids).toEqual(['a2a/xct-research', 'a2a/xct-writing']);
    const [url, config] = freshAxios.get.mock.calls[0];
    expect(url).toBe('https://tokenhub.test/v1/agents');
    expect(config.params).toMatchObject({ is_public: true });
    expect(config.headers.Authorization).toBe('Bearer sk-svc');
  });

  it('falls back to agent_id when agent_name is missing, and skips empties', async () => {
    process.env.LITELLM_AGENTS_ENABLED = 'true';
    freshAxios.get.mockResolvedValue({
      data: [{ agent_id: 'a1' }, { description: 'nameless' }],
    });

    const ids = await fetchAgentModelIds();
    expect(ids).toEqual(['a2a/a1']);
  });

  it('caches within the TTL (second call makes no gateway request)', async () => {
    process.env.LITELLM_AGENTS_ENABLED = 'true';
    freshAxios.get.mockResolvedValue({ data: [{ agent_name: 'xct-research' }] });

    const first = await fetchAgentModelIds();
    const second = await fetchAgentModelIds();

    expect(first).toEqual(['a2a/xct-research']);
    expect(second).toEqual(['a2a/xct-research']);
    expect(freshAxios.get).toHaveBeenCalledTimes(1);
  });

  it('returns [] on gateway errors instead of throwing', async () => {
    process.env.LITELLM_AGENTS_ENABLED = 'true';
    freshAxios.get.mockRejectedValue(new Error('503 from gateway'));

    const ids = await fetchAgentModelIds();
    expect(ids).toEqual([]);
  });
});
