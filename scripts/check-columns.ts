
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);

async function checkColumns() {
    console.log('Inspecionando colunas de order_payments...');
    const { data, error } = await supabase.rpc('get_table_columns', { t_name: 'order_payments' });

    // Se a RPC não existir (o que é provável), tentamos via query direta se possível ou apenas listamos o que conseguimos
    if (error) {
        console.log('RPC falhou, tentando via select trivial...');
        const { data: sample, error: selectError } = await supabase.from('order_payments').select('*').limit(1);
        if (selectError) {
            console.error('Erro ao selecionar:', selectError.message);
        } else {
            console.log('Colunas encontradas:', Object.keys(sample[0] || {}));
        }
    } else {
        console.log('Colunas (via RPC):', data);
    }
}

checkColumns();
