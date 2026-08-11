/**
 * DTO para criação de pedido
 */

import { IsNumber, IsNotEmpty, IsOptional, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  product_id: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  quantity: number;

  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  unit_price: number;
}

export class BocaDetailsDto {
  @IsNumber()
  @IsNotEmpty()
  value: number; // Valor que ficará pendente

  @IsOptional()
  @IsNumber()
  paid_now?: number; // Valor pago no ato (para pagamento parcial)

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CardDetailsDto {
  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsNumber()
  tax?: number;

  @IsOptional()
  @IsString()
  transaction_id?: string;
}

export class CreateOrderDto {
  @IsOptional()
  @IsNumber()
  customer_id?: number;

  @IsOptional()
  @IsNumber()
  seller_id?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  couponCode?: string;

  @IsString()
  @IsNotEmpty()
  payment_method: string;

  @IsString()
  @IsNotEmpty()
  payment_status: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BocaDetailsDto)
  boca_details?: BocaDetailsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CardDetailsDto)
  card_details?: CardDetailsDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}

