/**
 * XCT fork — LiteLLM Hub integration (FORK-CHANGES.md §2).
 *
 * publishAgent: P4 publish-sync — push a LibreChat-built agent to the
 * tokenhub registry (/v1/agents) so it appears in xct-home's catalog and
 * becomes a platform-wide consumption unit. Gated + fail-safe like every
 * other function in this module.
 */

jest.mock('axios');
const axios = require('axios');

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
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.LITELLM_PUBLISH_ENABLED;
    process.env.LITELLM_BASEURL = 'https://tokenhub.test';
    process.env.LITELLM_API_KEY = 'sk-svc';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('is disabled by default (no gateway call)', async () => {
    const result = await publishAgent(AGENT_DOC);
    expect(result).toMatchObject({ published: false, reason: 'disabled' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('POSTs an agent card to /v1/agents when enabled', async () => {
    enablePublish();
    axios.post.mockResolvedValue({ data: { agent_id: 'xct-translator' } });

    const result = await publishAgent(AGENT_DOC);

    expect(result).toMatchObject({ published: true, agent_id: 'xct-translator' });
    expect(axios.post).toHaveBeenCalledTimes(1);

    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://tokenhub.test/v1/agents');
    expect(config.headers.Authorization).toBe('Bearer sk-svc');
    expect(body.agent_name).toBe('xct-agent_abc123');
    expect(body.agent_card_params).toMatchObject({
      name: '🌐 Translator',
      description: 'Translates anything.',
    });
    // Resource composition rides along so the registry knows what the
    // agent is made of (model + tools).
    expect(body.agent_card_params.skills).toEqual([
      expect.objectContaining({ id: 'model:deepseek-v4-flash' }),
      expect.objectContaining({ id: 'tool:web_search' }),
    ]);
  });

  it('returns published:false on gateway errors instead of throwing', async () => {
    enablePublish();
    axios.post.mockRejectedValue(new Error('503 from gateway'));

    const result = await publishAgent(AGENT_DOC);
    expect(result.published).toBe(false);
    expect(result.reason).toContain('503');
  });

  it('rejects agents without an id or name', async () => {
    enablePublish();
    const result = await publishAgent({ description: 'nameless' });
    expect(result).toMatchObject({ published: false, reason: 'invalid_agent' });
    expect(axios.post).not.toHaveBeenCalled();
  });
});
