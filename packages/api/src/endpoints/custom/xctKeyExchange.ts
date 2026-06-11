/**
 * XCT fork: per-user LiteLLM virtual-key exchange (see FORK-CHANGES.md).
 *
 * LibreChat's custom endpoints normally use one shared API key. For the
 * 'XCity AI' endpoint (tokenhub.xcity.one) that would bill every user to the
 * same key and bypass per-plan budgets/RPM. This module swaps in the user's
 * own virtual key, fetched from xct-wallet's key-exchange endpoint
 * (POST /v1/keys/for-user, service-token auth) and cached in-process.
 *
 * Fail-safe by design: any wallet error resolves to `null`, and the caller
 * falls back to the shared key — chat must never break on a wallet outage.
 *
 * Env:
 *   XCT_KEY_EXCHANGE_ENABLED   "true" to enable the exchange
 *   WALLET_BASE_URL            e.g. https://wallet.xcity.one
 *   WALLET_SERVICE_TOKEN       shared service token
 *   XCT_ENDPOINT_NAME          endpoint to intercept (default: "XCity AI")
 */

import { logger } from '@librechat/data-schemas';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  expiresAt: number;
  key: string;
}

const vkeyCache = new Map<string, CacheEntry>();

/** Test hook — reset the per-user key cache. */
export function clearVKeyCache(): void {
  vkeyCache.clear();
}

/** Is this the gateway endpoint whose key we swap per-user? */
export function isXctEndpoint(endpoint: string): boolean {
  return endpoint === (process.env.XCT_ENDPOINT_NAME || 'XCity AI');
}

/** Exchange is opt-in and requires complete wallet credentials. */
export function xctKeyExchangeEnabled(): boolean {
  return (
    String(process.env.XCT_KEY_EXCHANGE_ENABLED || '').toLowerCase() === 'true' &&
    !!process.env.WALLET_BASE_URL &&
    !!process.env.WALLET_SERVICE_TOKEN
  );
}

interface MinimalUser {
  id?: string;
  openidId?: string | null;
  email?: string | null;
}

/**
 * The wallet keys everything by the GoTrue uuid (OpenID `sub`). LibreChat
 * stores that as `user.openidId`, sometimes issuer-prefixed — extract the
 * uuid wherever it sits. Local (non-OpenID) users have none → null.
 */
function gotrueSubOf(user: MinimalUser | undefined): string | null {
  const candidates = [user?.openidId, user?.id];
  for (const c of candidates) {
    const match = typeof c === 'string' ? c.match(UUID_RE) : null;
    if (match) {
      return match[0].toLowerCase();
    }
  }
  return null;
}

/**
 * Resolve the user's LiteLLM virtual key via xct-wallet. Returns null when
 * the exchange is disabled, the user has no GoTrue identity, or the wallet
 * is unreachable — callers fall back to the shared key.
 */
export async function resolveUserVKey(user: MinimalUser | undefined): Promise<string | null> {
  if (!xctKeyExchangeEnabled()) {
    return null;
  }
  const sub = gotrueSubOf(user);
  if (!sub) {
    return null;
  }

  const cached = vkeyCache.get(sub);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.key;
  }

  try {
    const baseUrl = (process.env.WALLET_BASE_URL as string).replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/v1/keys/for-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.WALLET_SERVICE_TOKEN}`,
      },
      body: JSON.stringify({ user_id: sub }),
    });
    if (!res.ok) {
      logger.warn(`[xctKeyExchange] wallet returned ${res.status} for user ${sub}`);
      return null;
    }
    const body = (await res.json()) as { key?: string };
    if (!body.key) {
      logger.warn('[xctKeyExchange] wallet response missing key');
      return null;
    }
    vkeyCache.set(sub, { key: body.key, expiresAt: Date.now() + CACHE_TTL_MS });
    return body.key;
  } catch (e) {
    logger.warn(`[xctKeyExchange] exchange failed: ${(e as Error).message}`);
    return null;
  }
}
