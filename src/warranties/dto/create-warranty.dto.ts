import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsArray } from 'class-validator';

export class CreateWarrantyDto {
  @IsOptional()
  @IsNumber()
  customer_id?: number;

  @IsOptional()
  @IsNumber()
  order_id?: number;

  @IsNumber()
  @IsNotEmpty({ message: 'ID do produto é obrigatório' })
  product_id: number;

  @IsEnum(['plating', 'break', 'stone_loss', 'other'], { message: 'Tipo de garantia inválido' })
  type: 'plating' | 'break' | 'stone_loss' | 'other';

  @IsEnum(['sold', 'stock'], { message: 'Origem da garantia inválida' })
  origin: 'sold' | 'stock';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
