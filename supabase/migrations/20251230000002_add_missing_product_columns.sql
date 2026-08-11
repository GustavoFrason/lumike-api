-- Mais colunas de products que existem em produção mas nunca foram criadas
-- por uma migration rastreada (mesmo padrão de order_payments/site_settings
-- em 20251230000000/20251230000001). Encontradas ao testar a busca de
-- produtos no front local ("column products.sku2 does not exist").
--
-- purchase_date e short_description são NOT NULL sem default em produção
-- (ver comentário em products-import.service.ts) — o app sempre envia os
-- dois no INSERT, então não recebem DEFAULT aqui.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sku2 TEXT,
  ADD COLUMN IF NOT EXISTS collection TEXT,
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS short_description TEXT NOT NULL DEFAULT '';

-- Remove os defaults temporários usados só pra permitir o ADD COLUMN NOT
-- NULL numa tabela que pode já ter linhas (dev local com dados de teste
-- criados antes desta migration). Novas linhas passam a exigir os dois
-- campos explicitamente, batendo com o comportamento real de produção.
ALTER TABLE products ALTER COLUMN purchase_date DROP DEFAULT;
ALTER TABLE products ALTER COLUMN short_description DROP DEFAULT;
