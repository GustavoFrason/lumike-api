# Migrations — Lumilee

As migrations versionadas são os arquivos `AAAAMMDDHHMMSS_descricao.sql` desta pasta, aplicadas em ordem.

## ⚠️ Não use o SQL de `../legacy`

O `COMPLETE_SCHEMA.sql` (snapshot de nov/2025) e os scripts avulsos do início do projeto ficam em `../legacy`, só como referência histórica. Eles **estão desatualizados**: o `COMPLETE_SCHEMA.sql`, por exemplo, recria os triggers de estoque em `order_items`, o que desconta o estoque duas vezes por venda. Veja `../legacy/README.md`.

## Como aplicar

- **Local** (Docker, ver `supabase/config.toml`): `supabase db reset` aplica todas as migrations do zero.
- **Produção**: o banco de produção foi montado à mão no início, então o histórico de migrations dele não bate com estes arquivos. **Não rode `supabase db push` contra produção.** Aplique cada migration nova colando o conteúdo no SQL Editor, na ordem, e confira o resultado.

## Regras de segurança (desde `20261009000001_rls_lockdown_public_schema`)

- O app **não usa Supabase Auth**: todo acesso a dados passa pela API NestJS com a chave `service_role`. As roles `anon` e `authenticated` **não têm acesso** a nada em `public`.
- **Toda tabela nova precisa de RLS ligado**, sem policies:
  ```sql
  ALTER TABLE public.minha_tabela ENABLE ROW LEVEL SECURITY;
  ```
- Não dê `GRANT` para `anon`/`authenticated` em tabelas, views ou funções. As RPCs (`fn_*`) só devem ser executáveis por `service_role`.
- O Storage (bucket `produtos`) só tem leitura pública. O upload é feito pela API (`POST /uploads/images`).

## Usuário admin

Não existe credencial padrão. Para criar um admin ou trocar a senha dele:

```bash
cd lumike-api
ADMIN_EMAIL=voce@dominio.com ADMIN_PASSWORD='uma-senha-forte-com-12+' npx ts-node scripts/fix-admin-password.ts
```

O script usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE` do ambiente, então **confira se eles apontam para o projeto certo** antes de rodar.

## Verificação rápida

```sql
-- Tabelas sem RLS (deve voltar vazio)
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;

-- Funções que anon consegue executar (deve voltar vazio)
SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
```
