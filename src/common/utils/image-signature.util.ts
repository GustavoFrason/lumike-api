export interface DetectedImage {
  mime: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif';
  ext: 'jpg' | 'png' | 'gif' | 'webp' | 'avif';
}

/**
 * Identifica o tipo real de uma imagem pelos primeiros bytes (magic
 * numbers), ignorando o nome e o Content-Type declarados pelo cliente —
 * que são arbitrários. Retorna `null` para qualquer coisa que não seja um
 * dos formatos aceitos (ex: HTML/SVG disfarçado de .jpg).
 */
export function detectImageMime(buffer: Buffer): DetectedImage | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  // GIF: "GIF87a" / "GIF89a"
  const head6 = buffer.subarray(0, 6).toString('ascii');
  if (head6 === 'GIF87a' || head6 === 'GIF89a') {
    return { mime: 'image/gif', ext: 'gif' };
  }

  // WEBP: "RIFF" ???? "WEBP"
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', ext: 'webp' };
  }

  // AVIF: ???? "ftyp" "avif"/"avis"
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') {
      return { mime: 'image/avif', ext: 'avif' };
    }
  }

  return null;
}
