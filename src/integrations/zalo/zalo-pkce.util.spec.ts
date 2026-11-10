import { createHash } from 'crypto';
import { createPkcePair } from './zalo-pkce.util';

describe('createPkcePair', () => {
  it('creates a 43-char alphanumeric verifier and a base64url S256 challenge', () => {
    for (let i = 0; i < 200; i += 1) {
      const { codeVerifier, codeChallenge } = createPkcePair();

      expect(codeVerifier).toMatch(/^[A-Za-z0-9]{43}$/);
      expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(codeChallenge).toBe(
        createHash('sha256').update(codeVerifier).digest('base64url'),
      );
    }
  });
});
