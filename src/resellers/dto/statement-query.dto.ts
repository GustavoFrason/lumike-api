import { IsOptional, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Período do extrato do acerto (dias do calendário de São Paulo). */
export class StatementQueryDto {
  /** Informativo (envios/devoluções). As vendas não acertadas entram todas até o fim. */
  @IsOptional()
  @Matches(DATE, { message: 'period_start inválida (use AAAA-MM-DD)' })
  period_start?: string;

  /** Fim do período (padrão: hoje). */
  @IsOptional()
  @Matches(DATE, { message: 'period_end inválida (use AAAA-MM-DD)' })
  period_end?: string;
}
