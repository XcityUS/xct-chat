const mockSaveBuffer = jest.fn(async () => '/uploads/vid.mp4');

jest.mock('~/server/services/Files/strategies', () => ({
  getStrategyFunctions: () => ({ saveBuffer: mockSaveBuffer }),
}));
jest.mock('~/server/services/Files/retention', () => ({
  getRetentionExpiry: async () => ({}),
  getAgentFileRetentionExpiry: async () => ({}),
}));
jest.mock('~/models', () => ({
  createFile: async (doc) => doc,
}));

const { saveVideoFromUrl } = require('~/server/services/Files/process');

const req = () => ({
  config: { fileStrategy: 'local' },
  user: { id: 'user-1', tenantId: 'tenant-1' },
});

describe('saveVideoFromUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('decodes an mp4 base64 data URL without corruption (regression: digit in MIME type)', async () => {
    const payload = 'AAECAwQFBgcICQoLDA0ODw==';
    const file = await saveVideoFromUrl(`data:video/mp4;base64,${payload}`, {
      req: req(),
      filename: 'clip',
      context: 'video_generation',
    });

    expect(mockSaveBuffer).toHaveBeenCalledTimes(1);
    const passedBuffer = mockSaveBuffer.mock.calls[0][0].buffer;
    expect(Buffer.isBuffer(passedBuffer)).toBe(true);
    expect(passedBuffer.equals(Buffer.from(payload, 'base64'))).toBe(true);
    expect(file.type).toBe('video/mp4');
    expect(file.filename.endsWith('.mp4')).toBe(true);
    expect(file.context).toBe('video_generation');
    expect(file.bytes).toBe(Buffer.from(payload, 'base64').length);
  });

  it('rejects non-http(s) URLs (SSRF guard)', async () => {
    await expect(
      saveVideoFromUrl('file:///etc/passwd', { req: req(), filename: 'x' }),
    ).rejects.toThrow(/unsupported protocol/i);
    expect(mockSaveBuffer).not.toHaveBeenCalled();
  });
});
