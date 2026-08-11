/**
 * Roles Decorator
 * --------------------
 * Restringe uma rota (ou controller inteiro) aos papéis informados.
 * Combinado com `RolesGuard`, que lê esse metadado e compara com
 * `request.user.role`.
 *
 * Sem este decorator, qualquer usuário autenticado tem acesso (o padrão
 * seguro é "autenticado" — use @Roles() explicitamente para restringir mais).
 */
import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
