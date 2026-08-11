import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  IsNumber,
} from 'class-validator';

export class UpdateWarrantyDto {
  @IsOptional()
  @IsNumber()
  customer_id?: number;

  @IsOptional()
  @IsNumber()
  order_id?: number;

  @IsOptional()
  @IsNumber()
  product_id?: number;

  @IsOptional()
  @IsEnum(['plating', 'break', 'stone_loss', 'other'], {
    message: 'Tipo de garantia inválido',
  })
  type?: 'plating' | 'break' | 'stone_loss' | 'other';

  @IsOptional()
  @IsEnum(['sold', 'stock'], { message: 'Origem da garantia inválida' })
  origin?: 'sold' | 'stock';

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsEnum(
    ['pending', 'analyzing', 'factory', 'ready', 'finished', 'rejected'],
    { message: 'Status inválido' },
  )
  status?:
    | 'pending'
    | 'analyzing'
    | 'factory'
    | 'ready'
    | 'finished'
    | 'rejected';

  @IsOptional()
  @IsString()
  internal_notes?: string;
}
