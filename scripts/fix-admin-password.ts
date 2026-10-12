/**
 * Script para (re)definir a senha de um usuário admin com hash bcrypt.
 *
 * Execute:
 *   ADMIN_EMAIL=voce@dominio.com ADMIN_PASSWORD='senha-forte-aqui' \
 *     npx ts-node scripts/fix-admin-password.ts
 * ou:
 *   npx ts-node scripts/fix-admin-password.ts voce@dominio.com 'senha-forte-aqui'
 *
 * Não existe mais e-mail/senha padrão: antes o script gravava
 * admin@lumike.com / 123456 — credencial conhecida de qualquer um que lesse
 * o repositório. A senha também não é mais impressa no terminal.
 *
 * ATENÇÃO: usa SUPABASE_URL/SUPABASE_SERVICE_ROLE do ambiente — confira
 * para qual projeto (local ou produção) eles apontam antes de rodar.
 */

import * as bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

const MIN_PASSWORD_LENGTH = 12;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE;
const adminEmail = (process.env.ADMIN_EMAIL ?? process.argv[2] ?? '').trim();
const plainPassword = process.env.ADMIN_PASSWORD ?? process.argv[3] ?? '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórias');
  process.exit(1);
}

if (!adminEmail || !plainPassword) {
  console.error('❌ Informe ADMIN_EMAIL e ADMIN_PASSWORD (env ou argumentos).');
  process.exit(1);
}

if (plainPassword.length < MIN_PASSWORD_LENGTH) {
  console.error(`❌ A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAdminPassword() {
  try {
    // Gera hash bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    // Busca o usuário
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', adminEmail)
      .maybeSingle();

    if (findError) {
      console.error('❌ Erro ao buscar usuário:', findError);
      process.exitCode = 1;
      return;
    }

    if (!user) {
      console.log('⚠️  Usuário não encontrado. Criando como admin...');

      // Busca o role admin
      const { data: adminRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'admin')
        .single();

      if (!adminRole) {
        console.error('❌ Role "admin" não encontrado');
        process.exitCode = 1;
        return;
      }

      // Cria o usuário admin
      const { error: createError } = await supabase.from('users').insert({
        name: 'Administrador',
        email: adminEmail,
        password: hashedPassword,
        role_id: adminRole.id,
        is_active: true,
      });

      if (createError) {
        console.error('❌ Erro ao criar usuário:', createError);
        process.exitCode = 1;
        return;
      }

      console.log(`✅ Usuário admin ${adminEmail} criado com sucesso!`);
    } else {
      // Atualiza a senha do usuário existente
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', user.id);

      if (updateError) {
        console.error('❌ Erro ao atualizar senha:', updateError);
        process.exitCode = 1;
        return;
      }

      console.log(`✅ Senha de ${adminEmail} atualizada com sucesso!`);
    }
  } catch (error) {
    console.error('❌ Erro inesperado:', error);
    process.exitCode = 1;
  }
}

void fixAdminPassword();
