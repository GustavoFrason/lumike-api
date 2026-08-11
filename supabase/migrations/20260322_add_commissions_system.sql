-- ==========================================
-- MIGRATION: SISTEMA DE COMISSÕES (20%)
-- Data: 22/03/2026
-- Descrição: Adiciona rastreabilidade de vendas e taxas de comissão por vendedor.
-- ==========================================

-- 1. Adicionar taxa de comissão aos usuários (padrão 20%)
-- Isso permite flexibilidade caso um vendedor tenha uma taxa diferente dos demais.
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(5,2) DEFAULT 20.00;

-- 2. Vincular pedidos a vendedores para rastreabilidade
-- Permite saber QUEM realizou a venda no PDV.
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS seller_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- 3. (Opcional) Indexar para performance nos relatórios
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);

-- 4. Comentários para documentação no PostgREST
COMMENT ON COLUMN users.commission_rate IS 'Percentual de comissão do vendedor (ex: 20.00 para 20%)';
COMMENT ON COLUMN orders.seller_id IS 'Identificador do vendedor que realizou a venda';
