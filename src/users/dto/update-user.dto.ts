/**
 * DTO para atualização de usuário (staff). Todos os campos são opcionais.
 */
import {
  IsString,
  IsEmail,
  IsOptional,
  IsNumber,
  IsBoolean,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'E-mail inválido' })
  email?: string;

  // O formulário de edição manda `password: ''` quando a senha não é
  // alterada; @IsOptional() só ignora null/undefined, então a string vazia
  // caía no @MinLength e toda edição sem troca de senha dava 400.
  @Transform(({ value }: { value: unknown }) =>
    value === '' ? undefined : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter ao menos 6 caracteres' })
  password?: string;

  @IsOptional()
  @IsNumber()
  role_id?: number;

  @IsOptional()
  @IsNumber()
  commission_rate?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
