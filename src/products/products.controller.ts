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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../auth/decorators/public.decorator';
import { ProductsService } from './products.service';
import { ProductsImportService, ImportItem } from './products-import.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { GetProductsFilterDto } from './dto/get-products-filter.dto';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';

@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly importService: ProductsImportService,
  ) { }

  @Post('import/xml')
  @UseInterceptors(FileInterceptor('file'))
  async importXml(
    @UploadedFile(
      new FileValidationPipe({
        maxSizeInBytes: 10 * 1024 * 1024, // 10MB
        allowedExtensions: ['xml'],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.importService.parseNfe(file.buffer);
  }

  @Post('import/xlsx')
  @UseInterceptors(FileInterceptor('file'))
  async importXlsx(
    @UploadedFile(
      new FileValidationPipe({
        maxSizeInBytes: 10 * 1024 * 1024, // 10MB
        allowedExtensions: ['xlsx', 'xls'],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.importService.parseXlsx(file.buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @UploadedFile(
      new FileValidationPipe({
        maxSizeInBytes: 10 * 1024 * 1024, // 10MB
        allowedExtensions: ['xml', 'xlsx', 'xls'],
      }),
    )
    file: Express.Multer.File,
  ) {
    const extension = file.originalname.split('.').pop()?.toLowerCase();

    if (extension === 'xml') {
      return this.importService.parseNfe(file.buffer);
    } else if (extension === 'xlsx' || extension === 'xls') {
      return this.importService.parseXlsx(file.buffer);
    }
  }

  @Post('import/confirm')
  confirmImport(@Body() items: ImportItem[]) {
    return this.importService.processImport(items);
  }

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
  async bulkStatusUpdate(@Body() body: { ids: number[], is_active: boolean }) {
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

