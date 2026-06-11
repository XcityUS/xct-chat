/**
 * XCT fork: per-user LiteLLM virtual-key exchange (see FORK-CHANGES.md).
 *
 * The 'XCity AI' custom endpoint must hit tokenhub with the *user's own*
 * virtual key (per-plan models/budget/RPM enforced by LiteLLM) instead of
 * the shared LITELLM_API_KEY. The key comes from xct-wallet's
 * POST /v1/keys/for-user exchange, keyed by the user's GoTrue uuid
 * (OpenID `sub`, stored as user.openidId). Fail-safe: any error falls back
 * to the shared key so chat never breaks on a wallet outage.
 */

const ORIGINAL_ENV = { ...process.env };

const mockFetch = jest.fn();

import {
  clearVKeyCache,
  isXctEndpoint,
  resolveUserVKey,
  xctKeyExchangeEnabled,
} from './xctKeyExchange';

function enableExchange() {
  process.env.XCT_KEY_EXCHANGE_ENABLED = 'true';
  process.env.WALLET_BASE_URL = 'https://wallet.test';
  process.env.WALLET_SERVICE_TOKEN = 'svc-token';
}

const GOTRUE_SUB = '6f9619ff-8b86-4d01-b42d-00cf4fc964ff';

describe('xctKeyExchange', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.XCT_KEY_EXCHANGE_ENABLED;
    delete process.env.WALLET_BASE_URL;
    delete process.env.WALLET_SERVICE_TOKEN;
    delete process.env.XCT_ENDPOINT_NAME;
    global.fetch = mockFetch as unknown as typeof fetch;
    mockFetch.mockReset();
    clearVKeyCache();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('isXctEndpoint', () => {
    it('matches the default endpoint name', () => {
      expect(isXctEndpoint('XCity AI')).toBe(true);
      expect(isXctEndpoint('openrouter')).toBe(false);
    });

    it('honors XCT_ENDPOINT_NAME override', () => {
      process.env.XCT_ENDPOINT_NAME = 'TokenHub';
      expect(isXctEndpoint('TokenHub')).toBe(true);
      expect(isXctEndpoint('XCity AI')).toBe(false);
    });
  });

  describe('xctKeyExchangeEnabled', () => {
    it('is off by default', () => {
      expect(xctKeyExchangeEnabled()).toBe(false);
    });

    it('requires flag + wallet url + service token', () => {
      enableExchange();
      expect(xctKeyExchangeEnabled()).toBe(true);
      delete process.env.WALLET_SERVICE_TOKEN;
      expect(xctKeyExchangeEnabled()).toBe(false);
    });
  });

  describe('resolveUserVKey', () => {
    it('exchanges the GoTrue sub (openidId) for the wallet-held vkey', async () => {
      enableExchange();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'sk-xcity-user', plan: 'pro_monthly', minted: false }),
      });

      const key = await resolveUserVKey({ id: 'mongo-id', openidId: GOTRUE_SUB });
      expect(key).toBe('sk-xcity-user');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://wallet.test/v1/keys/for-user',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ Authorization: 'Bearer svc-token' }),
          body: JSON.stringify({ user_id: GOTRUE_SUB }),
        }),
      );
    });

    it('strips an issuer prefix from openidId before exchanging', async () => {
      enableExchange();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ key: 'sk-prefixed' }),
      });
      const key = await resolveUserVKey({ id: 'x', openidId: `https://auth.xcity.one|${GOTRUE_SUB}` });
      expect(key).toBe('sk-prefixed');
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).user_id).toBe(GOTRUE_SUB);
    });

    it('caches the key per user (no second wallet round-trip)', async () => {
      enableExchange();
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({ key: 'sk-cached' }) });

      await resolveUserVKey({ id: 'x', openidId: GOTRUE_SUB });
      const again = await resolveUserVKey({ id: 'x', openidId: GOTRUE_SUB });

      expect(again).toBe('sk-cached');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns null (fail-safe) when the user has no GoTrue uuid', async () => {
      enableExchange();
      expect(await resolveUserVKey({ id: 'local-user' })).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null (fail-safe) on wallet errors instead of throwing', async () => {
      enableExchange();
      mockFetch.mockRejectedValue(new Error('wallet down'));
      expect(await resolveUserVKey({ id: 'x', openidId: GOTRUE_SUB })).toBeNull();
    });

    it('returns null (fail-safe) on non-2xx wallet responses', async () => {
      enableExchange();
      mockFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
      expect(await resolveUserVKey({ id: 'x', openidId: GOTRUE_SUB })).toBeNull();
    });

    it('returns null when the exchange is disabled', async () => {
      expect(await resolveUserVKey({ id: 'x', openidId: GOTRUE_SUB })).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
