import { IsEmail, IsInt, IsOptional, IsUUID, IsString } from 'class-validator';

export class CreateStockNotificationDto {
    @IsOptional()
    @IsInt()
    user_id?: number;

    @IsOptional()
    @IsString()
    email?: string;

    @IsInt()
    product_id: number;

    @IsOptional()
    @IsUUID()
    variant_id?: string;
}
