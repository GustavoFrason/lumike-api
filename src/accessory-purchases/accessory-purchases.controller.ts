import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { AccessoryPurchasesService } from './accessory-purchases.service';
import { CreateAccessoryPurchaseDto } from './dto/create-accessory-purchase.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';

/** Compras de acessórios/embalagens: só admin/gestor. */
@Roles(...MANAGEMENT_ROLES)
@Controller('accessory-purchases')
export class AccessoryPurchasesController {
  constructor(private readonly service: AccessoryPurchasesService) {}

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
