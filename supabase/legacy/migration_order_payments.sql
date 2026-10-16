-- Migration: Create order_payments table for payment history
-- This table tracks all payments (partial or full) made towards an order

CREATE TABLE order_payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    received_by_user_id BIGINT REFERENCES users(id),
    receiver_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for performance
CREATE INDEX idx_order_payments_order_id ON order_payments(order_id);

COMMENT ON TABLE order_payments IS 'Histórico de pagamentos recebidos por pedido';
