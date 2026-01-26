import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom decorator to extract the authenticated user from the request.
 * Returns the JWT payload with consistent structure: { sub, email, role, role_id }
 */
export const User = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return request.user; // Set by JwtAuthGuard
    },
);
