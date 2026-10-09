import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStockNotificationDto {
  /**
   * IGNORADO pelo backend — a identidade vem do JWT. Mantido no DTO só
   * para não rejeitar (forbidNonWhitelisted) o front antigo durante o
   * deploy. Pode ser removido quando nenhum cliente mandar mais.
   */
  @IsOptional()
  @IsInt()
  user_id?: number;

  /** Obrigatório (e validado no service) só para visitante sem login. */
  @IsOptional()
  @IsString()
  email?: string;

  @IsInt()
  product_id: number;

  // Bug pré-existente: validava como @IsUUID(), mas
  // stock_notifications.variant_id é bigint no banco (confirmado via
  // introspecção do schema ao vivo) — qualquer variant_id numérico real
  // seria rejeitado por essa validação.
  @IsOptional()
  @IsInt()
  variant_id?: number;
}
