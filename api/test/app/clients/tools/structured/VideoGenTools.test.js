const axios = require('axios');
const { ContentTypes } = require('librechat-data-provider');
const VideoGenTool = require('~/app/clients/tools/structured/VideoGenTools');

const ORIGINAL_ENV = { ...process.env };
let postSpy;
let getSpy;

/** Build a tool instance with fast polling so async tests don't wait. */
function makeTool(overrides = {}) {
  return new VideoGenTool({
    isAgent: true,
    VIDEO_GEN_API_KEY: 'test-key',
    ...overrides,
  });
}

describe('VideoGenTool', () => {
  beforeEach(() => {
    postSpy = jest.spyOn(axios, 'post');
    getSpy = jest.spyOn(axios, 'get');
    process.env.VIDEO_GEN_API_KEY = 'test-key';
    process.env.VIDEO_GEN_BASEURL = 'https://gateway.test/v1';
    process.env.VIDEO_GEN_MODEL = 'dreamina-seedance-2-0-260128';
    process.env.VIDEO_GEN_POLL_INTERVAL_MS = '1';
    process.env.VIDEO_GEN_MAX_WAIT_MS = '2000';
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('throws when instantiated for a non-agent without override', () => {
    expect(() => new VideoGenTool({ isAgent: false })).toThrow(/only available for agents/);
  });

  it('does not throw when instantiated with override (startup)', () => {
    delete process.env.VIDEO_GEN_API_KEY;
    expect(() => new VideoGenTool({ override: true })).not.toThrow();
  });

  it('throws when prompt is missing', async () => {
    const tool = makeTool();
    await expect(tool._call({})).rejects.toThrow(/prompt/);
  });

  it('builds an OpenAI-compatible payload with the model, prompt, and provided optionals', () => {
    const tool = makeTool();
    const payload = tool.buildPayload({
      prompt: 'a cat surfing',
      seconds: 5,
      size: '1280x720',
      input_reference: 'https://img.test/a.png',
    });
    expect(payload).toEqual({
      model: 'dreamina-seedance-2-0-260128',
      prompt: 'a cat surfing',
      seconds: 5,
      size: '1280x720',
      input_reference: 'https://img.test/a.png',
    });
  });

  it('omits absent optionals from the payload', () => {
    const tool = makeTool();
    expect(tool.buildPayload({ prompt: 'hello' })).toEqual({
      model: 'dreamina-seedance-2-0-260128',
      prompt: 'hello',
    });
  });

  it('returns a VIDEO_URL artifact for a synchronous url response', async () => {
    postSpy.mockResolvedValueOnce({
      data: { data: [{ url: 'https://cdn.test/clip.mp4' }] },
    });
    const tool = makeTool();
    const [response, artifact] = await tool._call({ prompt: 'a cat surfing' });

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).not.toHaveBeenCalled();
    expect(response[0].type).toBe(ContentTypes.TEXT);
    expect(artifact.content).toEqual([
      { type: ContentTypes.VIDEO_URL, video_url: { url: 'https://cdn.test/clip.mp4' } },
    ]);
    expect(artifact.file_ids).toHaveLength(1);
  });

  it('polls an async job until completion and returns the resolved url', async () => {
    postSpy.mockResolvedValueOnce({ data: { id: 'job-1', status: 'queued' } });
    getSpy
      .mockResolvedValueOnce({ data: { status: 'in_progress' } })
      .mockResolvedValueOnce({ data: { status: 'completed', url: 'https://cdn.test/done.mp4' } });

    const tool = makeTool();
    const [, artifact] = await tool._call({ prompt: 'a dog running' });

    expect(getSpy).toHaveBeenCalledTimes(2);
    expect(artifact.content[0].video_url.url).toBe('https://cdn.test/done.mp4');
  });

  it('resolves the LiteLLM-normalized output_url from a completed poll (BytePlus/seedance)', async () => {
    postSpy.mockResolvedValueOnce({ data: { id: 'cgt-123', status: 'queued' } });
    getSpy
      .mockResolvedValueOnce({ data: { id: 'cgt-123', status: 'in_progress' } })
      .mockResolvedValueOnce({
        data: { id: 'cgt-123', status: 'completed', output_url: 'https://ark.test/out.mp4' },
      });

    const tool = makeTool();
    const [, artifact] = await tool._call({ prompt: 'seedance clip' });
    expect(artifact.content[0].video_url.url).toBe('https://ark.test/out.mp4');
  });

  it('resolves a base64 data url from a synchronous b64_json response', async () => {
    postSpy.mockResolvedValueOnce({ data: { data: [{ b64_json: 'AAAABBBB' }] } });
    const tool = makeTool();
    const [, artifact] = await tool._call({ prompt: 'clip' });
    expect(artifact.content[0].video_url.url).toBe('data:video/mp4;base64,AAAABBBB');
  });

  it('returns an error message tuple when the job fails', async () => {
    postSpy.mockResolvedValueOnce({ data: { id: 'job-2', status: 'queued' } });
    getSpy.mockResolvedValueOnce({ data: { status: 'failed' } });

    const tool = makeTool();
    const [message, artifact] = await tool._call({ prompt: 'bad prompt' });
    expect(typeof message).toBe('string');
    expect(message).toMatch(/error occurred/i);
    expect(artifact).toEqual({});
  });

  it('returns an error message tuple when the create call throws', async () => {
    postSpy.mockRejectedValueOnce(new Error('gateway down'));
    const tool = makeTool();
    const [message] = await tool._call({ prompt: 'x' });
    expect(message).toMatch(/video service may be unavailable/i);
  });

  it('sends the provided API key as the Bearer credential (per-user vkey billing)', async () => {
    postSpy.mockResolvedValueOnce({ data: { output_url: 'https://cdn.test/x.mp4' } });
    const tool = makeTool({ VIDEO_GEN_API_KEY: 'user-vkey-abc123' });
    await tool._call({ prompt: 'bill me' });
    const postConfig = postSpy.mock.calls[0][2];
    expect(postConfig.headers.Authorization).toBe('Bearer user-vkey-abc123');
  });
});
