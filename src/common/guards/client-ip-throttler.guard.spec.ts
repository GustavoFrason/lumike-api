import { resolveClientIp } from './client-ip-throttler.guard';

describe('resolveClientIp', () => {
  const SECRET = 's3cr3t-compartilhado';

  const req = (headers: Record<string, string>, ip = '10.0.0.1') => ({
    ip,
    headers,
  });

  it('uses X-Client-IP when the shared secret matches', () => {
    expect(
      resolveClientIp(
        req({
          'x-client-ip': '177.10.20.30',
          'x-internal-proxy-secret': SECRET,
        }),
        SECRET,
      ),
    ).toBe('177.10.20.30');
  });

  it('accepts IPv6 client addresses', () => {
    expect(
      resolveClientIp(
        req({
          'x-client-ip': '2804:14c:abcd::1',
          'x-internal-proxy-secret': SECRET,
        }),
        SECRET,
      ),
    ).toBe('2804:14c:abcd::1');
  });

  it('ignores X-Client-IP when the secret is wrong (cannot be spoofed)', () => {
    expect(
      resolveClientIp(
        req({
          'x-client-ip': '1.2.3.4',
          'x-internal-proxy-secret': 'chute',
        }),
        SECRET,
      ),
    ).toBe('10.0.0.1');
  });

  it('ignores X-Client-IP when no secret is configured on the server', () => {
    expect(
      resolveClientIp(
        req({ 'x-client-ip': '1.2.3.4', 'x-internal-proxy-secret': '' }),
        undefined,
      ),
    ).toBe('10.0.0.1');
  });

  it('ignores malformed X-Client-IP values', () => {
    expect(
      resolveClientIp(
        req({
          'x-client-ip': 'evil, 1.2.3.4',
          'x-internal-proxy-secret': SECRET,
        }),
        SECRET,
      ),
    ).toBe('10.0.0.1');
  });

  it('falls back to req.ip without proxy headers', () => {
    expect(resolveClientIp(req({}, '200.1.1.1'), SECRET)).toBe('200.1.1.1');
  });
});
