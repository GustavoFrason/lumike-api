import { IsString, IsNotEmpty, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateAccessoryPurchaseDto {
    @IsString()
    @IsNotEmpty()
    type: string;

    @IsNumber()
    @Min(1)
    quantity: number;

    @IsString()
    @IsNotEmpty()
    supplier: string;

    @IsDateString()
    @IsNotEmpty()
    purchase_date: string;

    @IsNumber()
    @Min(0)
    unit_price: number;

    @IsString()
    @IsOptional()
    notes?: string;
}
