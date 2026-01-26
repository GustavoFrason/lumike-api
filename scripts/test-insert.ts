
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE!);

async function test() {
    console.log('Testando inserção em orders...');
    const { data, error } = await supabase
        .from('orders')
        .insert({
            customer_id: null,
            status: 'pending',
            total_amount: 100,
            notes: 'Teste Manual',
            payment_method: 'pix',
            payment_status: 'pago'
        })
        .select();

    if (error) {
        console.error('ERRO:', error);
    } else {
        console.log('SUCESSO:', data);
    }
}

test();
