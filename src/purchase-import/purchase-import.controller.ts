/**
 * PurchaseImportController
 * --------------------
 * Importação de compra via planilha Excel da Zarpellon Joias.
 */

import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import { ConfirmImportDto } from './dto/confirm-import.dto';
import { PurchaseImportService } from './purchase-import.service';

/** Compras de mercadoria: só admin/gestor (mesmo guard de PurchasesController). */
@Roles(...MANAGEMENT_ROLES)
@Controller('purchase-import')
export class PurchaseImportController {
  constructor(private readonly purchaseImportService: PurchaseImportService) {}

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  async preview(
    @UploadedFile(
      new FileValidationPipe({
        maxSizeInBytes: 10 * 1024 * 1024, // 10MB
        allowedExtensions: ['xlsx', 'xls'],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.purchaseImportService.buildPreview(file.buffer);
  }

  @Post('confirm')
  async confirm(@Body() dto: ConfirmImportDto) {
    return this.purchaseImportService.confirm(dto);
  }
}
