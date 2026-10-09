/**
 * ProductsModule
 * --------------------
 * Define o módulo de produtos da Lumilee API.
 */

import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { ProductsImagesService } from './products-images.service';
import { ProductsImagesController } from './products-images.controller';
import { ProductsUploadsController } from './products-uploads.controller';

@Module({
  controllers: [
    ProductsController,
    ProductsImagesController,
    ProductsUploadsController,
  ],
  providers: [ProductsService, ProductsImagesService],
  exports: [ProductsService, ProductsImagesService],
})
export class ProductsModule {}
