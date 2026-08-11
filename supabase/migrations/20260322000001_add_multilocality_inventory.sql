-- ==========================================
-- MIGRATION: INVENTÁRIO POR LOCALIDADE (MALAS)
-- Data: 22/03/2026
-- ==========================================

-- 1. Criar tabela de estoque por localidade/vendedor
CREATE TABLE IF NOT EXISTS inventory_locations (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, -- NULL significa Estoque Central
    quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(product_id, user_id)
);

-- 2. Migrar estoque atual para o Estoque Central (user_id IS NULL)
INSERT INTO inventory_locations (product_id, user_id, quantity)
SELECT id, NULL, COALESCE(current_stock, 0)
FROM products
ON CONFLICT (product_id, user_id) DO UPDATE 
SET quantity = EXCLUDED.quantity;

-- 3. Criar tabela de histórico de transferências entre localidades
CREATE TABLE IF NOT EXISTS inventory_transfers (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    from_user_id BIGINT REFERENCES users(id), -- NULL = Central
    to_user_id BIGINT REFERENCES users(id),   -- NULL = Central
    quantity INTEGER NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Criar gatilho para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_inventory_locations_updated_at
    BEFORE UPDATE ON inventory_locations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 5. Comentários para documentação
COMMENT ON TABLE inventory_locations IS 'Armazena a quantidade de cada produto em posse de cada vendedor ou no estoque central.';
COMMENT ON COLUMN inventory_locations.user_id IS 'Identificador do vendedor. NULL indica Estoque Central/Matriz.';
