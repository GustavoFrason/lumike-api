/**
 * TransferBatchesController
 * --------------------
 * Transferência de peças em lote entre estoques. `preview` (multipart,
 * nada persistido) + `create` (JSON, transfere as peças válidas), mais o
 * histórico e o romaneio de cada lote.
 */

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';
import { FileValidationPipe } from '../common/pipes/file-validation.pipe';
import {
  CreateTransferBatchDto,
  ListTransferBatchesDto,
  parseLocation,
  TransferBatchPreviewAllDto,
  TransferBatchPreviewDto,
} from './dto/transfer-batch.dto';
import { TransferBatchesService } from './transfer-batches.service';

/** Movimentar estoque é só da gestão (igual à transferência unitária). */
@Roles(...MANAGEMENT_ROLES)
@Controller('transfer-batches')
export class TransferBatchesController {
  constructor(
    private readonly transferBatchesService: TransferBatchesService,
  ) {}

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
    @Body() dto: TransferBatchPreviewDto,
  ) {
    return this.transferBatchesService.buildPreview(
      file.buffer,
      parseLocation(dto.from_user_id),
      parseLocation(dto.to_user_id),
    );
  }

  @Get('preview-all')
  async previewAll(@Query() dto: TransferBatchPreviewAllDto) {
    return this.transferBatchesService.buildPreviewAll(dto.from_user_id);
  }

  @Post()
  async create(
    @Body() dto: CreateTransferBatchDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.transferBatchesService.create(dto, user);
  }

  @Get()
  async findAll(@Query() filters: ListTransferBatchesDto) {
    return this.transferBatchesService.findAll(filters);
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transferBatchesService.findOne(id);
  }
}
