/**
 * JwtAuthGuard
 * --------------------
 * Guard que protege rotas exigindo autenticação JWT válida.
 * Respeita o decorator @Public() para rotas públicas.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthUser } from '../types/auth-user.type';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Verifica se a rota é pública
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (isPublic) {
      // Autenticação opcional: rota pública continua acessível a anônimos,
      // mas quem manda um token válido ganha `request.user` (ex: a vitrine
      // mostra dados completos pra staff). Token inválido aqui é ignorado.
      if (token) {
        try {
          (request as Request & { user?: AuthUser }).user =
            await this.jwtService.verifyAsync<AuthUser>(token, {
              secret: process.env.JWT_SECRET,
            });
        } catch {
          // segue como anônimo
        }
      }
      return true;
    }

    if (!token) {
      throw new UnauthorizedException('Token não fornecido');
    }

    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token, {
        secret: process.env.JWT_SECRET,
      });

      // Adiciona o payload do token à requisição para uso posterior
      (request as Request & { user: AuthUser }).user = payload;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    return true;
  }

  /**
   * Extrai o token do header Authorization
   * Suporta formatos: "Bearer <token>" ou apenas "<token>"
   */
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(' ') ?? [];
    return type === 'Bearer' ? token : authHeader;
  }
}
