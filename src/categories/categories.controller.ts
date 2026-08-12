/**
 * CategoriesController
 * --------------------
 * Expõe endpoints REST para operações CRUD de categorias.
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
  ParseBoolPipe,
} from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

/** Gestão de catálogo: só admin/gestor. Leitura pública usa @Public() por rota. */
@Roles(...MANAGEMENT_ROLES)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() createCategoryDto: CreateCategoryDto) {
    return this.categoriesService.create(createCategoryDto);
  }

  @Public()
  @Get()
  findAll(
    // `optional: true` é essencial aqui: sem ele, ParseBoolPipe recebe
    // `undefined` quando ?is_active não vem na query (uso normal, "traga
    // tudo") e lança 400 em vez de deixar passar como undefined — só não
    // dava pra perceber antes porque todo call site do front sempre
    // mandava um valor explícito (true), nunca a chamada "sem filtro".
    @Query('is_active', new ParseBoolPipe({ optional: true }))
    isActive?: boolean,
  ) {
    return this.categoriesService.findAll(isActive);
  }

  @Public()
  @Get('slug/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.remove(id);
  }

  @Delete(':id/permanent')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.categoriesService.delete(id);
  }
}
