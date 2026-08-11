/**
 * RolesGuard
 * --------------------
 * Roda depois do JwtAuthGuard (que já populou `request.user`). Se a rota
 * tiver `@Roles(...)`, exige que `request.user.role` esteja na lista.
 * Sem `@Roles()`, qualquer usuário autenticado passa. Rotas `@Public()`
 * são sempre liberadas, mesmo que por engano tenham `@Roles()` também.
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types/auth-user.type';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Sem @Roles(): qualquer usuário autenticado (já validado pelo JwtAuthGuard) passa.
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const userRole = request.user?.role;

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `Acesso restrito. Papéis permitidos: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
