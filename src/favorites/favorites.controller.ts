import { Controller, Get, Post, Body } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';

/**
 * Favoritos: qualquer usuário autenticado (sem @Roles — escopo é sempre o
 * próprio usuário, nunca precisou de papel de staff). O JwtAuthGuard global
 * já cobre a autenticação, por isso não há @UseGuards local aqui.
 */
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Post('toggle')
  async toggle(
    @CurrentUser() user: AuthUser,
    @Body('productId') productId: number,
  ) {
    // Bug corrigido: o payload do JWT usa `sub` para o id do usuário, não `id`.
    return this.favoritesService.toggle(user.sub, productId);
  }

  @Get('ids')
  async getIds(@CurrentUser() user: AuthUser) {
    return this.favoritesService.getFavoriteIds(user.sub);
  }

  @Get()
  async getFavorites(@CurrentUser() user: AuthUser) {
    return this.favoritesService.getFavorites(user.sub);
  }
}
