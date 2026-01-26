# 📋 Scripts de Migração - Lumike

## 🚀 Script Completo

O arquivo `COMPLETE_SCHEMA.sql` contém todo o schema do banco de dados consolidado e pronto para execução.

### Como Executar

1. **Acesse o Supabase Dashboard**
   - Vá para https://app.supabase.com
   - Selecione seu projeto

2. **Abra o SQL Editor**
   - No menu lateral, clique em "SQL Editor"
   - Clique em "New query"

3. **Execute o Script**
   - Abra o arquivo `COMPLETE_SCHEMA.sql`
   - Copie todo o conteúdo
   - Cole no SQL Editor do Supabase
   - Clique em "Run" ou pressione `Ctrl+Enter`

### ⚠️ Importante: Senha do Admin

O script cria o usuário admin, mas a senha precisa ser atualizada com um hash bcrypt.

**Opção 1: Usar o script Node.js**
```bash
cd lumike-api
npm run ts-node scripts/fix-admin-password.ts
```

**Opção 2: Gerar hash online**
1. Acesse: https://bcrypt-generator.com/
2. Digite a senha: `123456`
3. Rounds: `10`
4. Copie o hash gerado
5. Execute no Supabase:
```sql
UPDATE users 
SET password = 'hash_gerado_aqui' 
WHERE email = 'admin@lumike.com';
```

**Opção 3: Gerar hash manualmente**
```sql
-- No Supabase, execute:
UPDATE users 
SET password = '$2b$10$SeuHashBcryptAqui' 
WHERE email = 'admin@lumike.com';
```

### 📝 Credenciais Padrão

Após atualizar a senha:
- **Email:** `admin@lumike.com`
- **Senha:** `123456`

### ✅ Verificação

Após executar o script, verifique se tudo foi criado:

```sql
-- Verificar tabelas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar usuário admin
SELECT id, name, email, role_id 
FROM users 
WHERE email = 'admin@lumike.com';

-- Verificar papéis
SELECT * FROM roles;
```

### 📦 Estrutura Criada

O script cria:
- ✅ Todos os ENUMs necessários
- ✅ Todas as tabelas (categories, products, customers, orders, etc.)
- ✅ Tabelas com UUID (colecoes, imagens_produto, estoque)
- ✅ Todas as funções e triggers
- ✅ Todas as views (dashboard, low_stock, top_sellers)
- ✅ Papéis básicos (admin, gestor, vendedor)
- ✅ Usuário admin (senha precisa ser atualizada)

### 🔧 Troubleshooting

**Erro: "relation already exists"**
- O script é idempotente, mas se houver conflitos, você pode precisar limpar o banco primeiro

**Erro: "type already exists"**
- Os ENUMs já existem, isso é normal se você executar o script múltiplas vezes

**Usuário admin não consegue fazer login**
- Verifique se a senha foi atualizada com hash bcrypt
- Execute o script `fix-admin-password.ts`

