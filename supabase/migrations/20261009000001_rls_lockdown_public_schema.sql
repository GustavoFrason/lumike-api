-- ==========================================================================
-- Fecha o schema `public` para as roles `anon` e `authenticated`.
-- ==========================================================================
-- Contexto: o app NÃO usa Supabase Auth. Todo acesso a dados passa pela
-- API NestJS, que usa a chave service_role (ignora RLS). Mesmo assim, a
-- anon key vai no bundle do front (usada só pro Storage), e nenhuma
-- migration ligava RLS — com os GRANTs padrão do Supabase, qualquer pessoa
-- com a anon key conseguia ler/gravar TODAS as tabelas pela REST API
-- (users com hash de senha, customers, cash_flow...) e chamar as RPCs
-- (fn_adjust_stock, fn_create_order...) direto.
--
-- O que esta migration faz (idempotente — pode rodar mais de uma vez, e
-- foi escrita pra funcionar também na produção, que foi montada à mão):
--   1. ENABLE ROW LEVEL SECURITY em toda tabela de `public`, sem nenhuma
--      policy → anon/authenticated não veem nada.
--   2. Remove TODAS as policies existentes em `public` (há policies
--      criadas à mão em produção, ex: site_settings UPDATE USING (true)).
--   3. REVOKE de tabelas, views, sequences e funções para anon,
--      authenticated e PUBLIC (o default do Postgres dá EXECUTE pra
--      PUBLIC em toda função nova).
--   4. GRANT explícito pra service_role (a API) — inclusive EXECUTE em
--      todas as funções, porque triggers chamam funções como `unaccent`
--      (instalada em public) com a role de quem fez o INSERT.
--   5. Default privileges: objetos FUTUROS criados por `postgres` já
--      nascem fechados.
--
-- PRÉ-REQUISITO: a env SUPABASE_SERVICE_ROLE da API precisa ser de fato a
-- chave service_role (claim role=service_role, ou chave sb_secret_...).
-- Se for a anon key, a API para de funcionar depois disto.
--
-- ROLLBACK (emergência — reabre tudo como antes):
--   DO $$ DECLARE r record; BEGIN
--     FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--              WHERE n.nspname = 'public' AND c.relkind IN ('r','p') LOOP
--       EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', r.relname);
--     END LOOP; END $$;
--   GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
--   GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
--   GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;
-- ==========================================================================

-- 1 + 2. RLS em todas as tabelas e remoção de todas as policies
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')  -- tabelas comuns e particionadas
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
  END LOOP;

  FOR r IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    RAISE NOTICE 'policy removida: % em %', r.policyname, r.tablename;
  END LOOP;
END $$;

-- 3. Tira todo acesso direto de anon/authenticated (ALL TABLES cobre views)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- 4. A API (service_role) continua com acesso total
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- 5. Objetos futuros criados por `postgres` (migrations / SQL Editor) já
-- nascem sem acesso para anon/authenticated. Toda tabela nova ainda
-- precisa de `ENABLE ROW LEVEL SECURITY` explícito (ver README).
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

-- --------------------------------------------------------------------------
-- Verificação (rode depois; as três devem voltar 0 linhas):
--
-- -- tabelas sem RLS
-- SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity;
--
-- -- privilégios de tabela/view ainda concedidos a anon/authenticated
-- SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
--
-- -- funções que anon ainda consegue executar
-- SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- --------------------------------------------------------------------------
