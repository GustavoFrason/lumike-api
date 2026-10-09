/**
 * ProductsUploadsController
 * --------------------
 * Upload de imagens (produto, categoria, banner) para o Supabase Storage.
 *
 * Antes o front subia direto para o bucket com a anon key — o que exigia
 * policy de escrita para `anon` e deixava qualquer pessoa apagar/trocar as
 * fotos do catálogo. Agora só admin/gestor sobe, e via backend.
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
import { UploadImageDto } from './dto/upload-image.dto';
import { ProductsImagesService } from './products-images.service';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB (o front já comprime antes)

@Roles(...MANAGEMENT_ROLES)
@Controller('uploads')
export class ProductsUploadsController {
  constructor(private readonly imagesService: ProductsImagesService) {}

  @Post('images')
  @UseInterceptors(
    // `limits` faz o multer abortar arquivos grandes já no stream (413),
    // sem bufferizar tudo em memória antes do pipe rejeitar.
    FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_SIZE, files: 1 } }),
  )
  async uploadImage(
    @UploadedFile(new FileValidationPipe({ maxSizeInBytes: MAX_IMAGE_SIZE }))
    file: Express.Multer.File,
    @Body() dto: UploadImageDto,
  ) {
    return this.imagesService.uploadToStorage(dto.folder, file);
  }
}
