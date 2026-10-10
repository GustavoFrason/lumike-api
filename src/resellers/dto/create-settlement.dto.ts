import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Body de POST /resellers/:id/settlements (registrar acerto). */
export class CreateSettlementDto {
  @IsOptional()
  @Matches(DATE, { message: 'period_start inválida (use AAAA-MM-DD)' })
  period_start?: string;

  @Matches(DATE, { message: 'period_end inválida (use AAAA-MM-DD)' })
  period_end: string;

  /** Vendas incluídas no acerto (as do extrato marcadas na tela). */
  @IsArray()
  @ArrayMaxSize(5000)
  @IsInt({ each: true })
  order_ids: number[];

  /**
   * Valor efetivamente pago: positivo = a revendedora pagou à loja;
   * negativo = a loja pagou a ela (quando a comissão passa do recebido).
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  amount_paid: number;

  /** "A repassar" que a tela mostrou — se mudou, o acerto é recusado (409). */
  @IsNumber({ maxDecimalPlaces: 2 })
  expected_amount_due: number;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  payment_method?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
