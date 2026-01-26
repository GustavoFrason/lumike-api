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

