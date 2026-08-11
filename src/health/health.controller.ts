/**
 * Endpoint /health
 * Retorna status da API e valida a conexão com o Supabase.
 */

import { Controller, Get, Inject } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  @Public()
  @Get()
  async getHealth() {
    // pg_tables (catálogo de sistema) nunca deveria ter sido consultado via
    // PostgREST aqui — não faz parte do schema public tipado e é frágil
    // dependendo de permissão. Uma tabela real do domínio serve igual pra
    // validar conectividade.
    const { error } = await this.supabase
      .from('products')
      .select('id')
      .limit(1);

    return {
      status: 'ok',
      supabase: error ? 'unreachable' : 'connected',
      timestamp: new Date().toISOString(),
    };
  }
}
