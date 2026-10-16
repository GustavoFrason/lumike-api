-- Migration to add payment details to orders table

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS payment_method text,
ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'pago',
ADD COLUMN IF NOT EXISTS boca_value numeric(10, 2),
ADD COLUMN IF NOT EXISTS boca_notes text,
ADD COLUMN IF NOT EXISTS card_brand text,
ADD COLUMN IF NOT EXISTS card_tax numeric(10, 2),
ADD COLUMN IF NOT EXISTS transaction_id text;

-- Optional: Create index if filtering by payment status becomes frequent
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
