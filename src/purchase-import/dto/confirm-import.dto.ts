import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Item já revisado/editado pelo usuário no preview (só os buckets "novo
 * produto" e "atualização de estoque" chegam aqui — "não-catalogável" e
 * "erro" nunca são enviados pro confirm).
 */
export class ConfirmImportItemDto {
  @IsBoolean()
  is_new: boolean;

  /** Obrigatório quando is_new = false. */
  @IsOptional()
  @IsInt()
  product_id?: number;

  /** Obrigatório quando is_new = true. Valor literal da célula, sem normalização. */
  @IsOptional()
  @IsString()
  sku2?: string;

  /** Obrigatório quando is_new = true. */
  @IsOptional()
  @IsString()
  name?: string;

  /** Só usado quando is_new = true. */
  @IsOptional()
  @IsInt()
  category_id?: number;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsNumber()
  @Min(0)
  unit_cost: number;
}

export class ConfirmImportDto {
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * Data real da compra (pode ser retroativa — o vendedor às vezes só
   * sobe a planilha no sistema dias depois de ter comprado de verdade).
   * 'YYYY-MM-DD'. Se não vier, cai no dia do servidor (ver PurchaseImportService.confirm).
   */
  @IsOptional()
  @IsDateString()
  purchase_date?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmImportItemDto)
  items: ConfirmImportItemDto[];
}
