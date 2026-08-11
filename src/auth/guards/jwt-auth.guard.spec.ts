import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let jwtService: jest.Mocked<Pick<JwtService, 'verifyAsync'>>;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  const buildContext = (authHeader?: string) => {
    const request: any = {
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
      email: 'admin@lumike.com',
      role: 'admin',
      role_id: 1,
    };
    jwtService.verifyAsync.mockResolvedValue(payload);
    const { context, request } = buildContext('Bearer valid.token.here');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });
});
