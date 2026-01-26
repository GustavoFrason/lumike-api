import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { FavoritesService } from './favorites.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('favorites')
export class FavoritesController {
    constructor(private readonly favoritesService: FavoritesService) { }

    @UseGuards(JwtAuthGuard)
    @Post('toggle')
    async toggle(@Req() req, @Body('productId') productId: number) {
        const userId = req.user.id; // Pega do token JWT
        return this.favoritesService.toggle(userId, productId);
    }

    @UseGuards(JwtAuthGuard)
    @Get('ids')
    async getIds(@Req() req) {
        const userId = req.user.id;
        return this.favoritesService.getFavoriteIds(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Get()
    async getFavorites(@Req() req) {
        const userId = req.user.id;
        return this.favoritesService.getFavorites(userId);
    }
}
