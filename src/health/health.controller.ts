/**
 * Endpoint /health
 * Retorna status da API e valida a conexão com o Supabase.
 */

import { Controller, Get, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
  ) {}

  @Public()
  @Get()
  async getHealth() {
    const { data, error } = await this.supabase.from('pg_tables').select('tablename').limit(1);

    return {
      status: 'ok',
      supabase: error ? 'unreachable' : 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}