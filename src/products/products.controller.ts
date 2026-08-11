/**
 * ProductsController
 * --------------------
 * Expõe endpoints REST para operações CRUD de produtos.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsFilterDto } from './dto/get-products-filter.dto';

/** Gestão de catálogo: só admin/gestor. Rotas de leitura pública (vitrine) usam @Public() individualmente. */
@Roles(...MANAGEMENT_ROLES)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Public()
  @Get()
  findAll(@Query() filters: GetProductsFilterDto) {
    return this.productsService.findAll(
      filters.page,
      filters.limit,
      filters.is_active,
      filters.search,
      filters.category_id,
      filters.is_featured,
    );
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.productsService.findBySlug(slug);
  }

  @Patch('bulk-status')
  async bulkStatusUpdate(@Body() body: { ids: number[]; is_active: boolean }) {
    if (body.is_active) {
      return this.productsService.activateMany(body.ids);
    } else {
      return this.productsService.deactivateMany(body.ids);
    }
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ) {
    return this.productsService.update(id, updateProductDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.remove(id);
  }

  @Delete(':id/permanent')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.productsService.delete(id);
  }
}
