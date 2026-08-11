/**
 * DTOs para movimentações de estoque
 */

import { IsNumber, IsNotEmpty, IsString, IsOptional, Min } from 'class-validator';

export class StockEntryDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1, { message: 'Quantidade deve ser maior que zero' })
  quantity: number;

  @IsOptional()
  @IsString()
  reference?: string; // Ex: 'purchase:123' ou 'adjust:45'
}

export class StockExitDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1, { message: 'Quantidade deve ser maior que zero' })
  quantity: number;

  @IsOptional()
  @IsString()
  reference?: string; // Ex: 'order:123'
}

export class StockTransferDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  from_user_id?: number; // null = Central

  @IsOptional()
  @IsNumber()
  to_user_id?: number; // null = Central

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Conferência física de estoque: quanto foi contado numa localidade. */
export class StockAdjustmentDto {
  @IsOptional()
  @IsNumber()
  user_id?: number | null; // null = Central, número = revendedor(a)

  @IsNumber()
  @IsNotEmpty()
  @Min(0, { message: 'Quantidade contada não pode ser negativa' })
  counted_quantity: number;

  @IsString()
  @IsNotEmpty({ message: 'Motivo/observação da conferência é obrigatório' })
  reason: string;
}

