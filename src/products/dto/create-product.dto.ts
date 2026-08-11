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
