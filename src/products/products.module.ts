/**
 * ProductsModule
 * --------------------
 * Define o módulo de produtos da Lumike API.
 */

import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsImagesService } from './products-images.service';
import { ProductsImagesController } from './products-images.controller';

@Module({
  controllers: [ProductsController, ProductsImagesController],
  providers: [ProductsService, ProductsImagesService],
  exports: [ProductsService, ProductsImagesService],
})
export class ProductsModule {}
