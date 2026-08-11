/**
 * DTO de Login
 * --------------------
 * Define os dados esperados na requisição de autenticação.
 */

import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @MinLength(4, { message: 'Senha deve ter pelo menos 4 caracteres' })
  senha: string;
}
