import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { AuthUser } from '../types/auth-user.type';

interface FakeRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const buildContext = (authHeader?: string) => {
    const request: FakeRequest = {
      headers: { authorization: authHeader },
      user: undefined,
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { context, request };
  };

  beforeEach(() => {
    jwtService = { verifyAsync: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() };
    guard = new JwtAuthGuard(
      jwtService as unknown as JwtService,
      reflector as unknown as Reflector,
    );
  });

  it('allows access without checking token when the route is @Public()', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const { context } = buildContext(undefined);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('attaches request.user on a @Public() route when a valid token is sent', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const payload = { sub: 7, email: 'a@b.com', role: 'admin', role_id: 1 };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const { context, request } = buildContext('Bearer valid.token.here');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });

  it('still allows a @Public() route as anonymous when the token is invalid', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context, request } = buildContext('Bearer invalid.token.here');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toBeUndefined();
  });

  it('throws UnauthorizedException when no Authorization header is sent', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const { context } = buildContext(undefined);

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException when the token is invalid/expired', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = buildContext('Bearer invalid.token.here');

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('allows access and attaches the decoded payload to request.user when the token is valid', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const payload = {
      sub: 1,
      email: 'admin@lumilee.com',
      role: 'admin',
      role_id: 1,
    };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const { context, request } = buildContext('Bearer valid.token.here');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});
