import { IsString, IsOptional, IsEmail } from 'class-validator';

export class CreateLeadDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  whatsapp: string;

  @IsOptional()
  @IsString()
  birthday?: string;
}
