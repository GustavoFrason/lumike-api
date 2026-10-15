import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
  MaxLength,
  IsDateString,
} from 'class-validator';

/** Cabe numa etiqueta Joia 27x15mm (2 linhas de ~12 caracteres). */
export const LABEL_TEXT_MAX_LENGTH = 24;

export class CreateProductDto {
  // Opcional de propósito: não é mais digitado no admin — vira o próprio
  // `id` (auto-incremento) via trigger fn_generate_product_sku quando vem
  // vazio. Continua aceitando um valor explícito (import legado, etc.).
  @IsOptional()
  @IsString()
  sku?: string;

  @IsString()
  @IsNotEmpty({ message: 'SKU Zarpellon (código do fornecedor) é obrigatório' })
  sku2: string;

  /** 2º código do fornecedor (a Zarpellon tem 2 em alguns produtos). */
  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'Código Zarpellon 2: no máximo 50 caracteres' })
  sku2_alt?: string | null;

  /** Linha extra impressa na etiqueta (ex: LINHA PRATA, ARO 16, 45cm). */
  @IsOptional()
  @IsString()
  @MaxLength(LABEL_TEXT_MAX_LENGTH, {
    message: `Texto da etiqueta: no máximo ${LABEL_TEXT_MAX_LENGTH} caracteres`,
  })
  label_text?: string | null;

  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Descrição resumida é obrigatória' })
  @MaxLength(40, {
    message: 'Descrição resumida deve ter no máximo 40 caracteres',
  })
  short_description: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0, { message: 'Preço deve ser maior ou igual a zero' })
  price: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  preco_promocional?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost_price?: number;

  @IsDateString({}, { message: 'Data de compra inválida' })
  @IsNotEmpty({ message: 'Data de compra é obrigatória' })
  purchase_date: string;

  @IsOptional()
  @IsNumber()
  category_id?: number;

  @IsOptional()
  @IsNumber()
  supplier_id?: number;

  @IsOptional()
  @IsString()
  colecao_id?: string; // UUID (Mantendo legado se necessário)

  @IsOptional()
  @IsString()
  collection?: string; // Novo campo simples (string)

  /**
   * Aceito só por compatibilidade e IGNORADO: o produto nasce com estoque
   * 0 e o estoque inicial entra como movimentação — ver ProductsService.create.
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
