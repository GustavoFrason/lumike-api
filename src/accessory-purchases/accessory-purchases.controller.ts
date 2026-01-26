import { Controller, Get, Post, Body, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { AccessoryPurchasesService } from './accessory-purchases.service';
import { CreateAccessoryPurchaseDto } from './dto/create-accessory-purchase.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('accessory-purchases')
@UseGuards(JwtAuthGuard)
export class AccessoryPurchasesController {
    constructor(private readonly service: AccessoryPurchasesService) { }

    @Post()
    create(@Body() createDto: CreateAccessoryPurchaseDto) {
        return this.service.create(createDto);
    }

    @Get()
    findAll(
        @Query('page') page = 1,
        @Query('limit') limit = 50,
        @Query('type') type?: string,
    ) {
        return this.service.findAll(+page, +limit, type);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.remove(+id);
    }
}
