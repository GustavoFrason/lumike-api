/**
 * ProductsImagesController
 * --------------------
 * Expõe endpoints para gestão de imagens de produtos.
 * O upload do arquivo é feito no frontend via Supabase Storage,
 * este controller apenas registra a URL no banco de dados.
 */

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  Body,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ProductsImagesService } from './products-images.service';

@Controller('products/:productId/images')
export class ProductsImagesController {
  constructor(private readonly imagesService: ProductsImagesService) {}

  @Get()
  async getImages(@Param('productId', ParseIntPipe) productId: number) {
    return this.imagesService.getProductImages(productId);
  }

  @Post()
  async registerImage(
    @Param('productId', ParseIntPipe) productId: number,
    @Body() body: { url: string; ordem?: number },
  ) {
    if (!body.url) {
      throw new BadRequestException('URL da imagem é obrigatória');
    }

    return this.imagesService.registerImage(productId, body.url, body.ordem || 0);
  }

  @Delete(':imageId')
  async deleteImage(@Param('imageId', ParseUUIDPipe) imageId: string) {
    return this.imagesService.deleteImage(imageId);
  }

  @Post(':imageId/order')
  async updateOrder(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Body('ordem') ordem: number,
  ) {
    return this.imagesService.updateImageOrder(imageId, ordem);
  }
}

