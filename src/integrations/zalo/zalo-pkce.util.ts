import { createHash, randomBytes } from 'crypto';

const PKCE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

export function makeRandomId(length: number): string {
  let result = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    result += PKCE_CHARS.charAt(bytes[i] % PKCE_CHARS.length);
  }
  return result;
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = makeRandomId(43);
  // PKCE S256 (RFC 7636): code_challenge = base64url(SHA-256(code_verifier)),
  // không padding — "+"/"/" phải thành "-"/"_". Dùng base64 chuẩn từng làm
  // Zalo/relay id.onweb.asia từ chối khi hash chứa "+" hoặc "/".
  const codeChallenge = createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64url');

  return { codeVerifier, codeChallenge };
}

export function createOAuthState(): string {
  return makeRandomId(8);
}

/** Cryptographically stronger state when needed. */
export function createSecureOAuthState(): string {
  return randomBytes(16).toString('hex');
}
