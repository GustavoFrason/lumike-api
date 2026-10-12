-- ==========================================================================
-- Remove a escrita anônima no bucket "produtos" (storage.objects).
-- ==========================================================================
-- 20260809000000_storage_produtos_rls deu INSERT/UPDATE/DELETE para `anon`
-- porque o front subia as imagens direto com a anon key. Como a anon key é
-- pública, isso deixava QUALQUER pessoa apagar ou substituir as fotos do
-- catálogo. Agora o upload passa pela API (POST /uploads/images, só
-- admin/gestor, com service_role) e anon não precisa mais escrever.
--
-- A leitura continua pública (bucket público serve a URL sem policy).
--
-- ORDEM DE DEPLOY: aplicar SÓ DEPOIS que o front novo (upload via API)
-- estiver no ar — senão o upload de imagens do admin para de funcionar.
--
-- Se o DROP POLICY falhar por permissão (storage.objects pertence a
-- supabase_storage_admin em alguns projetos), remova as policies em
-- Dashboard → Storage → Policies.
-- ==========================================================================

DROP POLICY IF EXISTS "produtos: anon pode inserir" ON storage.objects;
DROP POLICY IF EXISTS "produtos: anon pode atualizar" ON storage.objects;
DROP POLICY IF EXISTS "produtos: anon pode remover" ON storage.objects;

-- Policies criadas à mão em produção com outros nomes: remove as de
-- escrita do bucket "produtos" abertas para anon/authenticated/public e
-- só avisa sobre as demais (outros buckets não são deste app).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname, cmd, roles, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  LOOP
    IF coalesce(r.qual, '') LIKE '%produtos%'
       OR coalesce(r.with_check, '') LIKE '%produtos%' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.policyname);
      RAISE NOTICE 'policy de storage removida: % (%)', r.policyname, r.cmd;
    ELSE
      RAISE WARNING 'policy de escrita aberta em storage.objects mantida (revise): % (%)',
        r.policyname, r.cmd;
    END IF;
  END LOOP;
END $$;
