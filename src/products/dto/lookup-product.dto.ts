import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Query de GET /products/lookup (busca exata por código). */
export class LookupProductDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o código' })
  @MaxLength(100)
  code: string;

  /** Só produtos ativos (ex: leitor de código do PDV). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  active_only?: boolean;
}
