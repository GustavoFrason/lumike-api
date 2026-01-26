/**
 * Public Decorator
 * --------------------
 * Decorator para marcar rotas como públicas (não requerem autenticação).
 */

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

