import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';

export class RegisterDto {
    @IsString()
    name: string;

    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
    senha: string;

    @IsOptional()
    @IsString()
    whatsapp?: string;
}
