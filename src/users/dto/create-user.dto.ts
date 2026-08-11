/**
 * DTO para criação de usuário (staff).
 * Só é atingível por quem já tem @Roles(StaffRole.ADMIN) — ver UsersController
 * — mas o DTO existe para documentar e validar o contrato mesmo assim: sem
 * ele, um `body: any` deixaria passar qualquer campo extra sem checagem
 * (inclusive campos que não existem na tabela `users`).
 */
import { IsString, IsNotEmpty, IsEmail, IsOptional, IsNumber, IsBoolean, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  name: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter ao menos 6 caracteres' })
  password?: string; // se omitido, o service usa uma senha temporária padrão

  @IsNumber()
  @IsNotEmpty({ message: 'Papel (role_id) é obrigatório' })
  role_id: number;

  @IsOptional()
  @IsNumber()
  commission_rate?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
