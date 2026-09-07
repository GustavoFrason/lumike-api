/**
 * wipe-produtos-storage.ts
 * ------------------------
 * Remove todos os arquivos de imagem de PRODUTO do bucket `produtos`,
 * preservando a pasta `categorias/` (imagens usadas por categories.image_url).
 *
 * Rodar DEPOIS de confirmar que o wipe do banco (wipe-commercial-data.sql)
 * deu certo — arquivos removidos do Storage não voltam.
 *
 * Usa SUPABASE_URL + SUPABASE_SERVICE_ROLE do .env (produção).
 * Rodar: cd lumike-api && npx ts-node scripts/wipe-produtos-storage.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!,
);

const BUCKET = 'produtos';
const KEEP_PREFIX = 'categorias';

/** Lista recursiva de caminhos de arquivo sob um prefixo (pastas = id === null). */
async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000 });
  if (error) throw new Error(`list(${prefix}): ${error.message}`);
  for (const entry of data ?? []) {
    const full = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      out.push(...(await listAll(full)));
    } else {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const top = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (top.error) throw top.error;

  const folders = (top.data ?? [])
    .filter((e) => e.id === null && e.name !== KEEP_PREFIX)
    .map((e) => e.name);
  const looseFiles = (top.data ?? [])
    .filter((e) => e.id !== null)
    .map((e) => e.name);

  console.log('Pastas de produto a limpar:', folders.length ? folders : '(nenhuma)');

  const files: string[] = [...looseFiles];
  for (const f of folders) files.push(...(await listAll(f)));
  console.log(`${files.length} arquivo(s) a remover`);
  if (files.length === 0) {
    console.log('Nada a fazer.');
    return;
  }

  for (let i = 0; i < files.length; i += 100) {
    const batch = files.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) throw new Error(`remove: ${error.message}`);
    console.log(`  removidos ${i + batch.length}/${files.length}`);
  }

  const after = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  console.log(
    '\nRestante no bucket:',
    (after.data ?? []).map((e) => e.name),
  );
  console.log('OK — categorias/ preservada.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
