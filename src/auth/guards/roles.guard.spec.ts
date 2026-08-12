import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { StaffRole } from '../enums/role.enum';
import { AuthUser } from '../types/auth-user.type';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const buildContext = (user?: AuthUser): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when the route is @Public(), regardless of roles required', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(true) // IS_PUBLIC_KEY
      .mockReturnValueOnce([StaffRole.ADMIN]); // ROLES_KEY (não deveria nem ser checado)

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows any authenticated user when the route has no @Roles()', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false) // não é pública
      .mockReturnValueOnce(undefined); // sem @Roles()

    const user: AuthUser = {
      sub: 1,
      email: 'cliente@lumilee.com',
      role: 'customer',
      role_id: 4,
    };
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('allows when the user role is in the required list', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([StaffRole.ADMIN, StaffRole.GESTOR]);

    const user: AuthUser = {
      sub: 2,
      email: 'gestor@lumilee.com',
      role: 'gestor',
      role_id: 2,
    };
    expect(guard.canActivate(buildContext(user))).toBe(true);
  });

  it('throws ForbiddenException when the user role is not in the required list', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([StaffRole.ADMIN]);

    const user: AuthUser = {
      sub: 3,
      email: 'vendedor@lumilee.com',
      role: 'vendedor',
      role_id: 3,
    };
    expect(() => guard.canActivate(buildContext(user))).toThrow(
      ForbiddenException,
    );
  });

  it('throws ForbiddenException when there is no user role at all (ex: customer sem role)', () => {
    reflector.getAllAndOverride
      .mockReturnValueOnce(false)
      .mockReturnValueOnce([StaffRole.ADMIN]);

    const user: AuthUser = {
      sub: 4,
      email: 'cliente@lumilee.com',
      role: null,
      role_id: null,
    };
    expect(() => guard.canActivate(buildContext(user))).toThrow(
      ForbiddenException,
    );
  });
});
