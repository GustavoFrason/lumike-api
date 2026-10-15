import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** 'central' (Estoque Lumilee) ou o id da revendedora. */
const LOCATION = /^(\d+|central)$/;
const LOCATION_MESSAGE = "deve ser 'central' ou o id da revendedora";

/** Converte o valor do formulário/query em user_id (null = Central). */
export function parseLocation(value: string | undefined): number | null {
  return !value || value === 'central' ? null : Number(value);
}

/**
 * Campos do multipart da prévia (vêm como texto junto com o arquivo).
 * Sem valor = Central.
 */
export class TransferBatchPreviewDto {
  @IsOptional()
  @Matches(LOCATION, { message: `from_user_id ${LOCATION_MESSAGE}` })
  from_user_id?: string;

  @IsOptional()
  @Matches(LOCATION, { message: `to_user_id ${LOCATION_MESSAGE}` })
  to_user_id?: string;
}

/** "Trazer tudo que está com a revendedora". */
export class TransferBatchPreviewAllDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  from_user_id: number;
}

export class TransferBatchItemDto {
  @IsInt()
  @Min(1)
  product_id: number;

  @IsInt({ message: 'Quantidade deve ser um número inteiro' })
  @Min(1, { message: 'Quantidade deve ser maior que zero' })
  quantity: number;
}

/** Confirmação: só as peças válidas da prévia (já revisadas na tela). */
export class CreateTransferBatchDto {
  /** null/ausente = Central. */
  @IsOptional()
  @IsInt()
  @Min(1)
  from_user_id?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  to_user_id?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Observação: no máximo 500 caracteres' })
  notes?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Nenhuma peça para transferir' })
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => TransferBatchItemDto)
  items: TransferBatchItemDto[];
}

export class ListTransferBatchesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Lotes que saíram ou chegaram neste local. */
  @IsOptional()
  @Matches(LOCATION, { message: `location ${LOCATION_MESSAGE}` })
  location?: string;
}
