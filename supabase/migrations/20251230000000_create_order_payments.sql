-- A tabela order_payments existe em produção mas nunca foi criada por uma
-- migration rastreada (foi criada manualmente no SQL Editor do dashboard em
-- algum momento). Reconstruída aqui via introspecção do schema real
-- (src/types/supabase.ts, gerado a partir do OpenAPI do PostgREST) para que
-- `supabase db reset` local fique consistente com produção.
--
-- Nota: é uma tabela distinta de `payments` (criada em 20251105163118), que
-- parece ter sido substituída por esta no fluxo atual de pagamentos de pedido.
CREATE TABLE IF NOT EXISTS order_payments (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id            BIGINT REFERENCES orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  amount              NUMERIC(12,2) NOT NULL,
  payment_method      TEXT NOT NULL,
  received_by_user_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  receiver_name       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
