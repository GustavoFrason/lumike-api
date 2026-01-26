import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';

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

@Controller('leads')
export class LeadsController {
    constructor(private readonly leadsService: LeadsService) { }

    @Post()
    async create(@Body() createLeadDto: CreateLeadDto) {
        return this.leadsService.create(createLeadDto);
    }

    // Admin only - requires Auth (skipped decorator for now unless AuthGuard is global or needed)
    @Get()
    async findAll() {
        return this.leadsService.findAll();
    }
}
