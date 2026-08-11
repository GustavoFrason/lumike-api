import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateStockNotificationDto {
  @IsOptional()
  @IsInt()
  user_id?: number;

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
