import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

/** Só dígitos hex, ponto e dois-pontos (IPv4/IPv6), tamanho limitado. */
const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * ThrottlerGuard que conta requisições pelo IP do cliente final.
 *
 * Quase todo tráfego chega do servidor Next.js (route handlers / SSR), não
 * do navegador — sem isso, todo mundo compartilha o mesmo IP: 5 logins
 * errados de uma pessoa bloqueavam o login de todos, e o site inteiro
 * dividia um único limite de 100 req/min.
 *
 * O Next manda o IP real em `X-Client-IP` junto de um segredo
 * compartilhado (`X-Internal-Proxy-Secret` = env INTERNAL_PROXY_SECRET).
 * Sem o segredo correto o header é ignorado — a URL da API é pública,
 * então qualquer um poderia forjar `X-Client-IP` para escapar do limite.
 * Fallback: `req.ip` (respeita `trust proxy`, ver main.ts).
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    return Promise.resolve(resolveClientIp(req));
  }
}

export function resolveClientIp(
  req: Record<string, unknown>,
  secret = process.env.INTERNAL_PROXY_SECRET,
): string {
  const headers = (req.headers ?? {}) as Record<string, unknown>;
  const sentSecret = headers['x-internal-proxy-secret'];
  const clientIp = headers['x-client-ip'];

  if (
    secret &&
    typeof sentSecret === 'string' &&
    typeof clientIp === 'string' &&
    IP_PATTERN.test(clientIp) &&
    safeEqual(sentSecret, secret)
  ) {
    return clientIp;
  }

  return typeof req.ip === 'string' ? req.ip : '';
}
