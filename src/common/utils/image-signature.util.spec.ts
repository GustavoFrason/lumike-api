import { detectImageMime } from './image-signature.util';

const withPadding = (head: number[] | Buffer) =>
  Buffer.concat([Buffer.from(head), Buffer.alloc(16)]);

describe('detectImageMime', () => {
  it('detects JPEG', () => {
    expect(detectImageMime(withPadding([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      mime: 'image/jpeg',
      ext: 'jpg',
    });
  });

  it('detects PNG', () => {
    expect(
      detectImageMime(
        withPadding([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).toEqual({ mime: 'image/png', ext: 'png' });
  });

  it('detects GIF', () => {
    expect(detectImageMime(withPadding(Buffer.from('GIF89a')))?.ext).toBe(
      'gif',
    );
  });

  it('detects WEBP', () => {
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from('WEBPVP8 '),
    ]);
    expect(detectImageMime(webp)?.mime).toBe('image/webp');
  });

  it('detects AVIF', () => {
    const avif = Buffer.concat([
      Buffer.from([0, 0, 0, 0x1c]),
      Buffer.from('ftypavif'),
      Buffer.alloc(8),
    ]);
    expect(detectImageMime(avif)?.ext).toBe('avif');
  });

  it('rejects HTML/SVG disguised as an image', () => {
    expect(
      detectImageMime(Buffer.from('<svg onload="alert(1)"></svg>')),
    ).toBeNull();
    expect(
      detectImageMime(Buffer.from('<html><script>x</script></html>')),
    ).toBeNull();
  });

  it('rejects empty or tiny buffers', () => {
    expect(detectImageMime(Buffer.alloc(0))).toBeNull();
    expect(detectImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});
