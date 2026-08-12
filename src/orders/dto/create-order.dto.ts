/**
 * DTO para criação de pedido
 */

import {
  IsInt,
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  Max,
  Min,
} from 'class-validator';
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

  // Só preenchido no modo "parcelado" — a validação real de parcela
  // mínima (R$50) é feita no banco, em fn_create_order, que conhece o
  // total do pedido; aqui é só o intervalo permitido pelo combo.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  installments?: number;
}

export class CreateOrderDto {
  @IsOptional()
  @IsNumber()
  customer_id?: number;

  // Quem recebe o crédito de comissão — não afeta de onde o estoque sai
  // (ver stock_location_user_id, abaixo). Antes esse campo fazia as duas
  // coisas: escolher um vendedor só pra comissão fazia a baixa de estoque
  // tentar descontar do estoque PESSOAL dele (normalmente vazio), dando
  // "estoque insuficiente" com saldo de sobra no Central.
  @IsOptional()
  @IsNumber()
  seller_id?: number;

  // De qual localidade (inventory_locations) o estoque desta venda sai.
  // undefined/null = Estoque Central. Independente de seller_id.
  @IsOptional()
  @IsNumber()
  stock_location_user_id?: number;

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
