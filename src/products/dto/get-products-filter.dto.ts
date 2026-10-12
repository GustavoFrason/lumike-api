import {
  IsOptional,
  IsBoolean,
  IsString,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import type { ProductSort } from '../products.service';

export class GetProductsFilterDto {
  /**
   * `newest` (padrão) = mais novos primeiro; `code` = número do item em
   * ordem crescente (tela de Produtos/Etiquetas). Ignorado na vitrine.
   */
  @IsOptional()
  @IsIn(['newest', 'code'])
  sort?: ProductSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 50;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  category_id?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return undefined;
  })
  @IsBoolean()
  is_featured?: boolean;
}
