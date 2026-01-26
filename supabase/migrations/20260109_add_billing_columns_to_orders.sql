-- Migration: Add missing billing and payment columns to orders table
-- This ensures the dashboard and payment history logic can run correctly

DO $$
BEGIN
    -- payment_method
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_method') THEN
        ALTER TABLE orders ADD COLUMN payment_method TEXT;
    END IF;

    -- payment_status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'payment_status') THEN
        ALTER TABLE orders ADD COLUMN payment_status TEXT;
    END IF;

    -- boca_value (saldo devedor)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'boca_value') THEN
        ALTER TABLE orders ADD COLUMN boca_value NUMERIC(12, 2) DEFAULT 0;
    END IF;

    -- boca_paid_now (sinal)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'boca_paid_now') THEN
        ALTER TABLE orders ADD COLUMN boca_paid_now NUMERIC(12, 2) DEFAULT 0;
    END IF;

    -- boca_notes
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'boca_notes') THEN
        ALTER TABLE orders ADD COLUMN boca_notes TEXT;
    END IF;

    -- card_brand
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'card_brand') THEN
        ALTER TABLE orders ADD COLUMN card_brand TEXT;
    END IF;

    -- card_tax
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'card_tax') THEN
        ALTER TABLE orders ADD COLUMN card_tax NUMERIC(12, 2) DEFAULT 0;
    END IF;

    -- transaction_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'transaction_id') THEN
        ALTER TABLE orders ADD COLUMN transaction_id TEXT;
    END IF;

END $$;

COMMENT ON COLUMN orders.boca_value IS 'Valor que ficou pendente de pagamento (fiado)';
COMMENT ON COLUMN orders.boca_paid_now IS 'Valor pago como sinal no ato da compra';
