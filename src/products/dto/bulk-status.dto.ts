import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
} from 'class-validator';

/**
 * Body de PATCH /products/bulk-status. Antes era um tipo inline (sem
 * validação nenhuma): `ids` podia vir vazio, com strings ou ausente.
 */
export class BulkStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  ids: number[];

  @IsBoolean()
  is_active: boolean;
}
