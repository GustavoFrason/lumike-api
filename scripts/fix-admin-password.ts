/**
 * Script para corrigir a senha do usuário admin com hash bcrypt
 * Execute: npx ts-node scripts/fix-admin-password.ts
 */

import * as bcrypt from 'bcrypt';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE!;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE são obrigatórias');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixAdminPassword() {
  try {
    const adminEmail = 'admin@lumike.com';
    const plainPassword = '123456'; // Senha padrão

    // Gera hash bcrypt
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(plainPassword, saltRounds);

    // Busca o usuário admin
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, email')
      .eq('email', adminEmail)
      .maybeSingle();

    if (findError) {
      console.error('❌ Erro ao buscar usuário:', findError);
      return;
    }

    if (!user) {
      console.log('⚠️  Usuário admin não encontrado. Criando...');
      
      // Busca o role admin
      const { data: adminRole } = await supabase
        .from('roles')
        .select('id')
        .eq('name', 'admin')
        .single();

      if (!adminRole) {
        console.error('❌ Role "admin" não encontrado');
        return;
      }

      // Cria o usuário admin
      const { error: createError } = await supabase
        .from('users')
        .insert({
          name: 'Administrador',
          email: adminEmail,
          password: hashedPassword,
          role_id: adminRole.id,
          is_active: true,
        });

      if (createError) {
        console.error('❌ Erro ao criar usuário:', createError);
        return;
      }

      console.log('✅ Usuário admin criado com sucesso!');
    } else {
      // Atualiza a senha do usuário existente
      const { error: updateError } = await supabase
        .from('users')
        .update({ password: hashedPassword })
        .eq('id', user.id);

      if (updateError) {
        console.error('❌ Erro ao atualizar senha:', updateError);
        return;
      }

      console.log('✅ Senha do usuário admin atualizada com sucesso!');
    }

    console.log(`\n📝 Credenciais:`);
    console.log(`   Email: ${adminEmail}`);
    console.log(`   Senha: ${plainPassword}`);
  } catch (error) {
    console.error('❌ Erro inesperado:', error);
  }
}

fixAdminPassword();

