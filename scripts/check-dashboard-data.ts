import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('--- DIAGNÓSTICO LEGACY DATA ---');

    const { data: orders, error } = await supabase.from('orders').select('id, status, payment_status, total_amount, boca_paid_now, created_at');

    if (error) {
        console.error('Erro ao buscar ordens:', error.message);
        return;
    }

    console.log(`Total de pedidos: ${orders?.length || 0}`);

    const breakdown = orders.reduce((acc: any, o) => {
        const key = `status:${o.status} | payment_status:${o.payment_status}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    console.log('Distribuição de Status:');
    console.table(breakdown);

    const legacyPaid = orders.filter(o => (o.status === 'paid' || o.status === 'completed') && !o.payment_status);
    console.log(`Pedidos Legados (status 'paid/completed' e payment_status NULL): ${legacyPaid.length}`);

    if (legacyPaid.length > 0) {
        const totalLegacy = legacyPaid.reduce((sum, o) => sum + Number(o.total_amount), 0);
        console.log(`Valor total ignorado pela lógica nova: R$ ${totalLegacy}`);
    }

    const { data: payments } = await supabase.from('order_payments').select('id, amount, created_at');
    console.log(`Total de registros em order_payments: ${payments?.length || 0}`);
}

checkData();
