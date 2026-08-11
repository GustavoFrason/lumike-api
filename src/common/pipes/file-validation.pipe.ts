import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

export interface FileValidationOptions {
  maxSizeInBytes?: number;
  allowedMimeTypes?: string[];
  allowedExtensions?: string[];
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly options: FileValidationOptions = {}) {}

  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }

    // Validar tamanho
    if (
      this.options.maxSizeInBytes &&
      file.size > this.options.maxSizeInBytes
    ) {
      const maxSizeMB = (this.options.maxSizeInBytes / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `Arquivo muito grande. Tamanho máximo: ${maxSizeMB}MB`,
      );
    }

    // Validar MIME type
    if (
      this.options.allowedMimeTypes &&
      this.options.allowedMimeTypes.length > 0
    ) {
      if (!this.options.allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          `Tipo de arquivo não permitido. Tipos aceitos: ${this.options.allowedMimeTypes.join(', ')}`,
        );
      }
    }

    // Validar extensão
    if (
      this.options.allowedExtensions &&
      this.options.allowedExtensions.length > 0
    ) {
      const extension = file.originalname.split('.').pop()?.toLowerCase();
      if (!extension || !this.options.allowedExtensions.includes(extension)) {
        throw new BadRequestException(
          `Extensão de arquivo não permitida. Extensões aceitas: ${this.options.allowedExtensions.join(', ')}`,
        );
      }
    }

    return file;
  }
}
