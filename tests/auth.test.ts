import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthService } from '../src/services/auth.service';

describe('Authentication & Membership Services', () => {
  it('should hash and verify passwords using bcrypt', async () => {
    const password = 'TestSecurePassword#2026';
    const hash = await AuthService.hashPassword(password);

    assert.notEqual(hash, password, 'Hash must not equal plaintext');
    assert.ok(hash.startsWith('$2'), 'Hash must follow standard bcrypt formatting');

    const isValid = await AuthService.verifyPassword(password, hash);
    assert.equal(isValid, true, 'Valid password verification must return true');

    const isInvalid = await AuthService.verifyPassword('WrongPassword123', hash);
    assert.equal(isInvalid, false, 'Invalid password verification must return false');
  });

  it('should sign and verify valid JWT tokens', () => {
    const payload = {
      userId: '11111111-1111-1111-1111-111111111111',
      mobileNumber: '+919876543210',
    };

    const token = AuthService.generateToken(payload);
    assert.ok(token, 'Token string must be generated');

    const verified = AuthService.verifyToken(token);
    assert.equal(verified.userId, payload.userId);
    assert.equal(verified.mobileNumber, payload.mobileNumber);
  });

  it('should reject malformed or tampered JWT tokens', () => {
    assert.throws(
      () => {
        AuthService.verifyToken('malformed.token.string');
      },
      /verification failed/,
      'Tampered token must throw verification error'
    );
  });
});
