-- SQL para corrigir os erros de esquema no Supabase
-- Execute estes comandos separadamente no SQL Editor do Supabase

-- 1. Garante que o valor existe no enum 'order_status' (caso ainda não tenha rodado)
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'parcelado_boca';

-- 2. Adiciona colunas faltantes na tabela 'order_payments'
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'payment';
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. Adiciona comentário explicativo (opcional)
COMMENT ON COLUMN order_payments.type IS 'Tipo do registro: payment (recebimento) ou refund (devolução/estorno)';
