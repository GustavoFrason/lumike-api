-- Policies de RLS pra bucket "produtos" (storage.objects). O app não usa o
-- Supabase Auth (login é JWT próprio via NestJS), então o client do front
-- fala com o Storage sempre como role `anon` — sem essas policies, todo
-- upload trava com "new row violates row-level security policy" (achado
-- testando "Novo Produto" contra o Supabase local; bucket é criado via
-- config.toml, mas isso não inclui nenhuma policy).
--
-- Bucket público já libera leitura via URL pública sem policy — falta só
-- escrita (insert/update/delete).
CREATE POLICY "produtos: anon pode inserir"
  ON storage.objects FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'produtos');

CREATE POLICY "produtos: anon pode atualizar"
  ON storage.objects FOR UPDATE
  TO anon
  USING (bucket_id = 'produtos')
  WITH CHECK (bucket_id = 'produtos');

CREATE POLICY "produtos: anon pode remover"
  ON storage.objects FOR DELETE
  TO anon
  USING (bucket_id = 'produtos');
