import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Filtros de GET /orders e GET /orders/summary.
 *
 * `seller_id`: id da vendedora, ou 'none' para vendas sem vendedora (loja).
 * `stock_location`: 'central' (estoque da loja) ou o id da revendedora de
 * cuja mala o estoque saiu.
 * `date_from`/`date_to`: dias do calendário de São Paulo ('YYYY-MM-DD').
 */
export class GetOrdersFilterDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number = 50;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;

  @IsOptional()
  @Matches(/^(\d+|none)$/, {
    message: "seller_id deve ser um id ou 'none'",
  })
  seller_id?: string;

  @IsOptional()
  @Matches(/^(\d+|central)$/, {
    message: "stock_location deve ser um id ou 'central'",
  })
  stock_location?: string;

  @IsOptional()
  @Matches(DATE, { message: 'date_from inválida (use AAAA-MM-DD)' })
  date_from?: string;

  @IsOptional()
  @Matches(DATE, { message: 'date_to inválida (use AAAA-MM-DD)' })
  date_to?: string;
}
