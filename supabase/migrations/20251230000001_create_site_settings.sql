-- A tabela site_settings existe em produção mas nunca foi criada por uma
-- migration rastreada (mesma situação de order_payments em
-- 20251230000000_create_order_payments.sql). Reconstruída aqui via
-- introspecção do schema real (src/types/supabase.ts).
--
-- `updated_at` é gravado manualmente pela aplicação (SettingsService.upsert),
-- não tem trigger.
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
