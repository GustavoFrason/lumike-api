import { Controller, Post, Body, Get } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { MANAGEMENT_ROLES } from '../auth/enums/role.enum';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  /**
   * Captura pública de lead (formulário de cupom/newsletter na vitrine).
   * Limite de 10/min por IP contra spam de cadastro.
   */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  async create(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.create(createLeadDto);
  }

  /** Listagem de leads: só admin/gestor (dado de marketing/CRM). */
  @Roles(...MANAGEMENT_ROLES)
  @Get()
  async findAll() {
    return this.leadsService.findAll();
  }
}
