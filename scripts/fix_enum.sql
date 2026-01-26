-- SQL para corrigir o erro de enum no Supabase
-- Execute estes comandos separadamente (fora de uma transação) no SQL Editor do Supabase

-- 1. Garante que o valor existe no enum 'order_status'
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'parcelado_boca';

-- 2. (Opcional) Se você quiser garantir que o enum de pagamentos também esteja completo
-- ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'authorized'; -- Já costuma existir, mas por segurança
