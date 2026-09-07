/**
 * backup-before-wipe.ts
 * ---------------------
 * Dump em JSON de todas as tabelas afetadas pelo reset comercial
 * (scripts/wipe-commercial-data.sql), rodado ANTES do wipe.
 *
 * Salva em lumike-api/backups/<timestamp>/<tabela>.json (pasta no .gitignore).
 * Usa SUPABASE_URL + SUPABASE_SERVICE_ROLE do .env (produção).
 *
 * Rodar: cd lumike-api && npx ts-node scripts/backup-before-wipe.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!,
);

// Mesma lista (e mesma intenção) do TRUNCATE em wipe-commercial-data.sql.
const TABLES = [
  'products',
  'orders',
  'order_items',
  'order_payments',
  'purchases',
  'purchase_items',
  'cash_flow',
  'stock_adjustments',
  'inventory_movements',
  'inventory_locations',
  'inventory_transfers',
  'stock_alerts',
  'stock_notifications',
  'product_favorites',
  'warranties',
  'imagens_produto',
];

async function dump(table: string, dir: string): Promise<number> {
  const rows: unknown[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  fs.writeFileSync(
    path.join(dir, `${table}.json`),
    JSON.stringify(rows, null, 2),
  );
  console.log(`  ${table}: ${rows.length} linhas`);
  return rows.length;
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(__dirname, '..', 'backups', stamp);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`Backup -> ${dir}`);

  let total = 0;
  for (const t of TABLES) total += await dump(t, dir);

  fs.writeFileSync(
    path.join(dir, '_manifest.json'),
    JSON.stringify(
      { generatedAt: new Date().toISOString(), tables: TABLES, totalRows: total },
      null,
      2,
    ),
  );
  console.log(`\nOK — ${total} linhas no total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
