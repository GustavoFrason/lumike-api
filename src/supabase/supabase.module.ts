/**
 * Módulo responsável por inicializar o cliente Supabase e torná-lo disponível via injeção de dependência.
 * Usa variáveis do .env: SUPABASE_URL e SUPABASE_SERVICE_ROLE.
 */

import { Module, Global } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';

@Global()
@Module({
  providers: [
    {
      provide: 'SUPABASE_CLIENT',
      useFactory: (): SupabaseClient<Database> => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE!;
        return createClient<Database>(url, key);
      },
    },
  ],
  exports: ['SUPABASE_CLIENT'],
})
export class SupabaseModule {}
