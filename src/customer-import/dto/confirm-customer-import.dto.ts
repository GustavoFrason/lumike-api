import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Item já revisado/editado pelo usuário no preview. Só o bucket "novos"
 * chega aqui — "já cadastrados" e "erros" nunca são enviados pro confirm.
 *
 * Todos os campos precisam estar declarados: o `ValidationPipe` global é
 * `forbidNonWhitelisted` (ver src/main.ts), então campo extra vira 400.
 */
export class ConfirmCustomerImportItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  cpf?: string;

  @IsOptional()
  @IsString()
  zipcode?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConfirmCustomerImportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmCustomerImportItemDto)
  items: ConfirmCustomerImportItemDto[];
}
