import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkCols() {
    const { data: cols, error } = await supabase.rpc('get_column_names', { t_name: 'orders' });
    if (error) {
        // Se a RPC não existir, tentamos via REST
        const { data: orders } = await supabase.from('orders').select('*').limit(1);
        if (orders && orders.length > 0) {
            console.log('Colunas de orders:', Object.keys(orders[0]));
        } else {
            // Se não tiver dados, tentamos outra forma
            const { data: schema } = await supabase.from('orders').select().limit(0);
            console.log('Schema info (heads):', schema);
        }
    } else {
        console.log('Colunas:', cols);
    }
}

checkCols();
