/**
 * DTO para criação de coleção
 */

import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateCollectionDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  nome: string;

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

