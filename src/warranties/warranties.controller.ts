import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WarrantiesService } from './warranties.service';
import { CreateWarrantyDto } from './dto/create-warranty.dto';
import { UpdateWarrantyDto } from './dto/update-warranty.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('warranties')
@UseGuards(JwtAuthGuard)
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
