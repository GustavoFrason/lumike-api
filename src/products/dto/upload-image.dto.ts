import { IsString, Matches } from 'class-validator';

/**
 * Campo de texto do multipart de POST /uploads/images.
 *
 * `folder` vira o prefixo do caminho no bucket `produtos`: o ID do produto
 * (`123`), `categorias` ou `banners`. A regex impede path traversal
 * (`../`) e escrita em pastas arbitrárias.
 */
export class UploadImageDto {
  @IsString()
  @Matches(/^(\d+|categorias|banners)$/, {
    message: 'folder deve ser o ID do produto, "categorias" ou "banners"',
  })
  folder: string;
}
