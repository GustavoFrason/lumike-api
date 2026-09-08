/**
 * CustomerImportController
 * --------------------
 * Carga de clientes via planilha Excel (onboarding). Mesmo padrão do
 * PurchaseImportController: `preview` (multipart, nada persistido) +
 * `confirm` (JSON, grava os "novos").
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
import { ConfirmCustomerImportDto } from './dto/confirm-customer-import.dto';
import { CustomerImportService } from './customer-import.service';

/** Carga de base de clientes: só admin/gestor (não é fluxo de PDV). */
@Roles(...MANAGEMENT_ROLES)
@Controller('customer-import')
export class CustomerImportController {
  constructor(private readonly customerImportService: CustomerImportService) {}

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
    return this.customerImportService.buildPreview(file.buffer);
  }

  @Post('confirm')
  async confirm(@Body() dto: ConfirmCustomerImportDto) {
    return this.customerImportService.confirm(dto);
  }
}
