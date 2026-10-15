/**
 * DTO para atualização de produto
 * Todos os campos são opcionais
 */

import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  IsDateString,
  MaxLength,
} from 'class-validator';
import { LABEL_TEXT_MAX_LENGTH } from './create-product.dto';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  sku2?: string;

  /** `null` ou '' limpa o campo. */
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Código Zarpellon 2: no máximo 50 caracteres' })
  sku2_alt?: string | null;

  /** `null` ou '' limpa o campo. */
  @IsOptional()
  @IsString()
  @MaxLength(LABEL_TEXT_MAX_LENGTH, {
    message: `Texto da etiqueta: no máximo ${LABEL_TEXT_MAX_LENGTH} caracteres`,
  })
  label_text?: string | null;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  short_description?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  preco_promocional?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost_price?: number;

  @IsOptional()
  @IsDateString()
  purchase_date?: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  supplier_id?: number;

  @IsOptional()
  @IsString()
  colecao_id?: string; // UUID

  @IsOptional()
  @IsString()
  collection?: string;

  /**
   * Aceito só por compatibilidade (telas antigas ainda enviam) e IGNORADO:
   * o estoque só muda por movimentação — ver ProductsService.update.
   */
  @IsOptional()
  @IsNumber()
  @Min(0)
  current_stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_stock?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsBoolean()
  is_featured?: boolean;
}
