-- Migration: Add boca_paid_now column to orders table
-- This column stores the amount paid upfront in partial "boca" (credit) sales

ALTER TABLE orders
ADD COLUMN boca_paid_now DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN orders.boca_paid_now IS 'Valor pago no ato em vendas de boca com pagamento parcial';
