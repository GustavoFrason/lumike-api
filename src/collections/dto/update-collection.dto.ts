/**
 * DTO para atualização de coleção
 * Todos os campos são opcionais
 */

import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateCollectionDto {
  @IsOptional()
  @IsString()
  nome?: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
