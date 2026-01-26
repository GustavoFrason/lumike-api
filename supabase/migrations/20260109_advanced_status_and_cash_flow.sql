-- Migration: Advanced Status and Cash Flow
-- Adds 'parcelado_boca' status, cash_flow table, and enhances order_payments

-- 1. Update order_status Enum (Cannot be in a transaction in some Postgres versions, but let's try)
-- If this fails, user might need to run it outside BEGIN/COMMIT
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'parcelado_boca';

-- 2. Create cash_flow table
CREATE TABLE IF NOT EXISTS cash_flow (
    id SERIAL PRIMARY KEY,
    type VARCHAR(10) NOT NULL CHECK (type IN ('IN', 'OUT')),
    category VARCHAR(50) NOT NULL, -- 'venda', 'estorno', 'compra', 'ajuste', 'outros'
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_cash_flow_created_at ON cash_flow(created_at);
CREATE INDEX IF NOT EXISTS idx_cash_flow_order_id ON cash_flow(order_id);

-- 3. Enhance order_payments table
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'payment'; -- 'payment' or 'refund'
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS notes TEXT;

COMMENT ON TABLE cash_flow IS 'Registro de fluxo de caixa (entradas e saídas reais)';
COMMENT ON COLUMN order_payments.type IS 'Tipo do registro: payment (recebimento) ou refund (devolução/estorno)';
