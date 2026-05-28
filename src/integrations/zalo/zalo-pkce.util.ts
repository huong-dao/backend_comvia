import { createHash, randomBytes } from 'crypto';

const PKCE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function makeRandomId(length: number): string {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += PKCE_CHARS.charAt(Math.floor(Math.random() * PKCE_CHARS.length));
  }
  return result;
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = makeRandomId(43);
  const codeChallenge = createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return { codeVerifier, codeChallenge };
}

export function createOAuthState(): string {
  return makeRandomId(8);
}

/** Cryptographically stronger state when needed. */
export function createSecureOAuthState(): string {
  return randomBytes(16).toString('hex');
}
