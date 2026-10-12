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
  // Tài liệu Zalo: code_challenge = Base64.encode(SHA-256.hash(ASCII(code_verifier)))
  // — chỉ "Base64 (without Padding)", KHÔNG phải base64url. Không được thay
  // "+"/"/" thành "-"/"_" (đó là base64url, Zalo không dùng) — nếu thay sẽ
  // làm code_challenge sai lệch với giá trị Zalo tự tính lại từ code_verifier
  // lúc đổi token, khiến OAuth thất bại bất cứ khi nào hash chứa "+" hoặc "/".
  const codeChallenge = createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64')
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
