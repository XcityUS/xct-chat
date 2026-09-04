jest.mock('@librechat/data-schemas', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

jest.mock('~/server/services/Config', () => ({
  loadDefaultModels: jest.fn(),
  loadConfigModels: jest.fn(),
}));

jest.mock('~/server/services/litellmSource', () => ({
  fetchAgentModelIds: jest.fn(),
}));

const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');
const { fetchAgentModelIds } = require('~/server/services/litellmSource');
const { loadModels } = require('./ModelController');

const ORIGINAL_ENV = { ...process.env };

describe('ModelController.loadModels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    loadDefaultModels.mockResolvedValue({ openAI: ['gpt-4o-mini'] });
    loadConfigModels.mockResolvedValue({ 'XCity AI': ['deepseek-v4-flash'] });
    fetchAgentModelIds.mockResolvedValue(['a2a/seedream-image-agent', 'a2a/seedance-video-agent']);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('does not append LiteLLM A2A agent model ids by default for the XCity chat list', async () => {
    const models = await loadModels({ user: { id: 'user-1' } });

    expect(models).toEqual({
      openAI: ['gpt-4o-mini'],
      'XCity AI': ['deepseek-v4-flash'],
    });
    expect(fetchAgentModelIds).not.toHaveBeenCalled();
  });

  it('does not append LiteLLM A2A agent model ids when chat-only filtering is enabled', async () => {
    process.env.XCT_FILTER_NON_CHAT_MODELS = 'true';

    const models = await loadModels({ user: { id: 'user-1' } });

    expect(models).toEqual({
      openAI: ['gpt-4o-mini'],
      'XCity AI': ['deepseek-v4-flash'],
    });
    expect(fetchAgentModelIds).not.toHaveBeenCalled();
  });

  it('treats quoted true as enabled for hosted env values', async () => {
    process.env.XCT_FILTER_NON_CHAT_MODELS = '"true"';

    const models = await loadModels({});

    expect(models['XCity AI']).toEqual(['deepseek-v4-flash']);
    expect(fetchAgentModelIds).not.toHaveBeenCalled();
  });

  it('keeps the legacy A2A append available when the chat-only filter is explicitly disabled', async () => {
    process.env.XCT_FILTER_NON_CHAT_MODELS = 'false';

    const models = await loadModels({});

    expect(models['XCity AI']).toEqual([
      'deepseek-v4-flash',
      'a2a/seedream-image-agent',
      'a2a/seedance-video-agent',
    ]);
    expect(fetchAgentModelIds).toHaveBeenCalledTimes(1);
  });
});
