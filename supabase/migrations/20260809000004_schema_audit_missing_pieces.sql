-- Auditoria completa: comparei o schema real de produção (introspecção via
-- OpenAPI do PostgREST) contra tudo que as migrations rastreadas produzem.
-- Isso pegou o que os achados pontuais de hoje não cobriam:
--
-- 1. A tabela `leads` (captura de lead/cupom do site) nunca foi criada por
--    nenhuma migration — mesmo padrão de order_payments/site_settings.
-- 2. 5 colunas usadas pelo código mas nunca migradas: categories.image_url,
--    customers.user_id, estoque.variant_id, order_items.variant_id,
--    users.whatsapp.
--
-- Nota: variant_id (uuid) não aponta pra nenhuma tabela de variantes real —
-- não existe "product_variants" no banco. Parece um recurso de variantes
-- (cor/tamanho) começado e nunca terminado. Recriado aqui do jeito que já
-- está em produção (sem FK, já que não há para onde apontar), mas vale
-- decidir se esse recurso vai pra frente ou se essas colunas somem.

CREATE TABLE IF NOT EXISTS leads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  email        TEXT,
  whatsapp     TEXT,
  birthday     TEXT,
  coupon_code  TEXT,
  is_used      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(whatsapp);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE estoque ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID;

ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;
