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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  ALL_STAFF_ROLES,
  MANAGEMENT_ROLES,
  isStaffRole,
} from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsFilterDto } from './dto/get-products-filter.dto';
import { BulkStatusDto } from './dto/bulk-status.dto';
import { LookupProductDto } from './dto/lookup-product.dto';

/** Gestão de catálogo: só admin/gestor. Rotas de leitura pública (vitrine) usam @Public() individualmente. */
@Roles(...MANAGEMENT_ROLES)
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  /**
   * Público, mas com autenticação opcional (ver JwtAuthGuard): staff
   * logado recebe todas as colunas e produtos inativos; visitante/cliente
   * recebe só a visão pública.
   */
  @Public()
  @Get()
  findAll(
    @Query() filters: GetProductsFilterDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.productsService.findAll({
      page: filters.page,
      limit: filters.limit,
      isActive: filters.is_active,
      search: filters.search,
      categoryId: filters.category_id,
      collectionId: filters.colecao_id,
      isFeatured: filters.is_featured,
      sort: filters.sort,
      publicView: !isStaffRole(user?.role),
    });
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.productsService.findBySlug(slug, !isStaffRole(user?.role));
  }

  /**
   * Busca exata por código (sku, sku2, sku2_alt ou id). Aberto a todo staff
   * — o PDV (vendedora) usa no leitor de código. Precisa vir antes de
   * `:id`, senão "lookup" cai no ParseIntPipe.
   */
  @Roles(...ALL_STAFF_ROLES)
  @Get('lookup')
  lookup(@Query() query: LookupProductDto) {
    return this.productsService.lookup(query.code, query.active_only);
  }

  @Patch('bulk-status')
  async bulkStatusUpdate(@Body() body: BulkStatusDto) {
    return this.productsService.setActiveMany(body.ids, body.is_active);
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
