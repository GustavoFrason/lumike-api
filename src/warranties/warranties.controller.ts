import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { UpdateWarrantyDto } from './dto/update-warranty.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';

/**
 * Gestão de garantias: só admin/gestor. A página "Minhas Garantias" do
 * cliente ainda é uma tela estática (mock) no frontend, não consome esta
 * rota — quando isso for implementado, precisará de um endpoint separado
 * com escopo por customer_id do próprio usuário logado.
 */
@Roles(...MANAGEMENT_ROLES)
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly warrantiesService: WarrantiesService) {}

  @Post()
  create(@Body() createWarrantyDto: CreateWarrantyDto) {
    return this.warrantiesService.create(createWarrantyDto);
  }

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('customer_id') customer_id?: string,
    @Query('origin') origin?: string,
  ) {
    return this.warrantiesService.findAll(
      page ? +page : 1,
      limit ? +limit : 50,
      { status, customer_id, origin },
    );
  }

  @Get('stats')
  getStats() {
    return this.warrantiesService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warrantiesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateWarrantyDto: UpdateWarrantyDto,
  ) {
    return this.warrantiesService.update(id, updateWarrantyDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.warrantiesService.remove(id);
  }
}
