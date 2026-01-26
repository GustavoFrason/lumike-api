-- =====================================================================
-- LUMIKE - Schema v2 (com dashboard + alerts + utilitários de roles)
-- Compatível com Supabase / PostgreSQL 15
-- =====================================================================

BEGIN;

-- ---------- ENUMS -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('pending', 'paid', 'completed', 'cancelled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE payment_method AS ENUM ('pix', 'credit_card', 'debit_card', 'boleto', 'cash', 'transfer');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_status') THEN
    CREATE TYPE payment_status AS ENUM ('pending', 'authorized', 'paid', 'refused', 'refunded', 'chargeback');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'movement_type') THEN
    CREATE TYPE movement_type AS ENUM ('IN', 'OUT', 'ADJUST');
  END IF;
END$$;

-- ---------- FUNÇÃO GENÉRICA updated_at -------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- CATEGORIAS -----------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS tg_categories_updated_at ON categories;
CREATE TRIGGER tg_categories_updated_at
BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- FORNECEDORES ---------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  cnpj          TEXT,
  email         TEXT,
  phone         TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS tg_suppliers_updated_at ON suppliers;
CREATE TRIGGER tg_suppliers_updated_at
BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- PRODUTOS -------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku           TEXT UNIQUE,          -- opcional, mas único se informado
  name          TEXT NOT NULL,
  description   TEXT,
  category_id   BIGINT REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET NULL,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  current_stock INTEGER NOT NULL DEFAULT 0,
  min_stock     INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
DROP TRIGGER IF EXISTS tg_products_updated_at ON products;
CREATE TRIGGER tg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- CLIENTES -------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  cpf           TEXT,
  address       TEXT,
  city          TEXT,
  state         TEXT,
  zipcode       TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uix_customers_email ON customers((lower(email))) WHERE email IS NOT NULL;
DROP TRIGGER IF EXISTS tg_customers_updated_at ON customers;
CREATE TRIGGER tg_customers_updated_at
BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- PAPÉIS & USUÁRIOS (ADMIN PAINEL) -------------------------
CREATE TABLE IF NOT EXISTS roles (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,      -- admin, gestor, vendedor
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS tg_roles_updated_at ON roles;
CREATE TRIGGER tg_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS users (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role_id     BIGINT REFERENCES roles(id) ON UPDATE CASCADE ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
DROP TRIGGER IF EXISTS tg_users_updated_at ON users;
CREATE TRIGGER tg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Função utilitária para verificar papel por email
CREATE OR REPLACE FUNCTION fn_user_has_role(p_email TEXT, p_role TEXT)
RETURNS BOOLEAN AS $$
DECLARE v_has BOOLEAN;
BEGIN
  SELECT TRUE
    INTO v_has
  FROM users u
  JOIN roles r ON r.id = u.role_id
  WHERE lower(u.email) = lower(p_email)
    AND r.name = p_role
    AND u.is_active = TRUE
  LIMIT 1;

  RETURN COALESCE(v_has, FALSE);
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------- PEDIDOS & ITENS -----------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id   BIGINT REFERENCES customers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  status        order_status NOT NULL DEFAULT 'pending',
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
DROP TRIGGER IF EXISTS tg_orders_updated_at ON orders;
CREATE TRIGGER tg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS order_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      BIGINT NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  total_price   NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- ---------- PAGAMENTOS ----------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id         BIGINT NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  method           payment_method NOT NULL,
  status           payment_status NOT NULL DEFAULT 'pending',
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  transaction_id   TEXT,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
DROP TRIGGER IF EXISTS tg_payments_updated_at ON payments;
CREATE TRIGGER tg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- COMPRAS (REPOSIÇÃO) -------------------------------------
CREATE TABLE IF NOT EXISTS purchases (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_id   BIGINT REFERENCES suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
DROP TRIGGER IF EXISTS tg_purchases_updated_at ON purchases;
CREATE TRIGGER tg_purchases_updated_at
BEFORE UPDATE ON purchases
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS purchase_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  purchase_id   BIGINT NOT NULL REFERENCES purchases(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost     NUMERIC(12,2) NOT NULL CHECK (unit_cost >= 0),
  total_cost    NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED
);
CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id);

-- ---------- HISTÓRICO DE MOVIMENTAÇÕES ------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  movement      movement_type NOT NULL,
  quantity      INTEGER NOT NULL CHECK (quantity <> 0),
  reference     TEXT,                       -- ex: 'order:123' ou 'purchase:45'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_type ON inventory_movements(movement);

-- ---------- AJUSTES DE ESTOQUE --------------------------------------
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    BIGINT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  delta         INTEGER NOT NULL,          -- +10 ou -3, etc
  reason        TEXT NOT NULL,             -- motivo
  created_by    BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_adjustments_product ON stock_adjustments(product_id);

-- ---------- FUNÇÕES DE ESTOQUE --------------------------------------
-- Função central de atualização de estoque e registro do movimento
CREATE OR REPLACE FUNCTION fn_update_product_stock(p_product_id BIGINT, p_delta INTEGER, p_reference TEXT, p_movement movement_type)
RETURNS VOID AS $$
BEGIN
  UPDATE products
     SET current_stock = current_stock + p_delta,
         updated_at = NOW()
   WHERE id = p_product_id;

  INSERT INTO inventory_movements(product_id, movement, quantity, reference)
  VALUES (p_product_id, p_movement, p_delta, p_reference);
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Triggers para SAÍDA de estoque ao inserir item de pedido
CREATE OR REPLACE FUNCTION trf_order_items_ai()
RETURNS TRIGGER AS $$
DECLARE v_ref TEXT;
BEGIN
  v_ref := 'order:' || NEW.order_id;
  PERFORM fn_update_product_stock(NEW.product_id, -NEW.quantity, v_ref, 'OUT');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_order_items_ai ON order_items;
CREATE TRIGGER tg_order_items_ai
AFTER INSERT ON order_items
FOR EACH ROW EXECUTE FUNCTION trf_order_items_ai();

-- Reverter SAÍDA ao deletar item de pedido
CREATE OR REPLACE FUNCTION trf_order_items_ad()
RETURNS TRIGGER AS $$
DECLARE v_ref TEXT;
BEGIN
  v_ref := 'order-cancel:' || OLD.order_id;
  PERFORM fn_update_product_stock(OLD.product_id, +OLD.quantity, v_ref, 'IN');
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_order_items_ad ON order_items;
CREATE TRIGGER tg_order_items_ad
AFTER DELETE ON order_items
FOR EACH ROW EXECUTE FUNCTION trf_order_items_ad();

-- Triggers para ENTRADA de estoque ao inserir item de compra
CREATE OR REPLACE FUNCTION trf_purchase_items_ai()
RETURNS TRIGGER AS $$
DECLARE v_ref TEXT;
BEGIN
  v_ref := 'purchase:' || NEW.purchase_id;
  PERFORM fn_update_product_stock(NEW.product_id, +NEW.quantity, v_ref, 'IN');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_purchase_items_ai ON purchase_items;
CREATE TRIGGER tg_purchase_items_ai
AFTER INSERT ON purchase_items
FOR EACH ROW EXECUTE FUNCTION trf_purchase_items_ai();

-- Ajustes manuais: registra movimento ADJUST
CREATE OR REPLACE FUNCTION trf_stock_adjustments_ai()
RETURNS TRIGGER AS $$
DECLARE v_ref TEXT;
BEGIN
  v_ref := 'adjust:' || NEW.id;
  PERFORM fn_update_product_stock(NEW.product_id, NEW.delta, v_ref, 'ADJUST');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_stock_adjustments_ai ON stock_adjustments;
CREATE TRIGGER tg_stock_adjustments_ai
AFTER INSERT ON stock_adjustments
FOR EACH ROW EXECUTE FUNCTION trf_stock_adjustments_ai();

-- ---------- PROCEDURE DE COMPRA (REPOSIÇÃO SEM DUPLICAR PRODUTO) ----
-- Se existir SKU informado, tenta localizar produto pelo SKU.
-- Se não houver SKU, tenta localizar por (name/category) como fallback leve.
-- Caso não encontre, cria produto e soma o estoque.
CREATE OR REPLACE PROCEDURE stpRegistrarCompra(
  p_supplier_id BIGINT,
  p_sku TEXT,
  p_name TEXT,
  p_category_id BIGINT,
  p_unit_cost NUMERIC(12,2),
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_product_id BIGINT;
  v_purchase_id BIGINT;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser > 0';
  END IF;

  -- Encontrar/crear produto
  IF p_sku IS NOT NULL AND length(trim(p_sku)) > 0 THEN
    SELECT id INTO v_product_id FROM products WHERE sku = p_sku;
  END IF;

  IF v_product_id IS NULL THEN
    SELECT id INTO v_product_id
      FROM products
     WHERE lower(name) = lower(p_name)
       AND (category_id = p_category_id OR p_category_id IS NULL)
     LIMIT 1;
  END IF;

  IF v_product_id IS NULL THEN
    INSERT INTO products(sku, name, category_id, price, cost_price, current_stock, min_stock, is_active)
    VALUES (p_sku, p_name, p_category_id, 0, COALESCE(p_unit_cost,0), 0, 0, TRUE)
    RETURNING id INTO v_product_id;
  END IF;

  -- Criar compra
  INSERT INTO purchases(supplier_id, total_amount, notes)
  VALUES (p_supplier_id, p_unit_cost * p_quantity, p_notes)
  RETURNING id INTO v_purchase_id;

  -- Registrar item de compra (entrada de estoque via trigger)
  INSERT INTO purchase_items(purchase_id, product_id, quantity, unit_cost)
  VALUES (v_purchase_id, v_product_id, p_quantity, p_unit_cost);
END;
$$;

-- ---------- ALERTAS DE ESTOQUE BAIXO --------------------------------
-- Tabela de alertas (um alerta ativo por produto; resolver quando reposto)
CREATE TABLE IF NOT EXISTS stock_alerts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id    BIGINT NOT NULL UNIQUE REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- View prática para painel
CREATE OR REPLACE VIEW vw_low_stock AS
SELECT
  p.id            AS product_id,
  p.name          AS product_name,
  p.sku,
  p.current_stock,
  p.min_stock,
  GREATEST(0, p.min_stock - p.current_stock) AS missing
FROM products p
WHERE p.current_stock < p.min_stock
ORDER BY missing DESC;

-- Trigger: quando produto cai abaixo do mínimo, cria/atualiza alerta
CREATE OR REPLACE FUNCTION trf_products_low_stock_alert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.current_stock < NEW.min_stock THEN
    INSERT INTO stock_alerts (product_id, is_active, last_triggered_at)
    VALUES (NEW.id, TRUE, NOW())
    ON CONFLICT (product_id)
    DO UPDATE SET is_active = TRUE, last_triggered_at = NOW(), resolved_at = NULL;
  ELSE
    -- Se repôs estoque (>= min_stock), marcar alerta como resolvido, se houver
    UPDATE stock_alerts
       SET is_active = FALSE, resolved_at = NOW()
     WHERE product_id = NEW.id
       AND is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_products_low_stock_alert ON products;
CREATE TRIGGER tg_products_low_stock_alert
AFTER UPDATE OF current_stock, min_stock ON products
FOR EACH ROW EXECUTE FUNCTION trf_products_low_stock_alert();

-- ---------- VIEWS DE DASHBOARD --------------------------------------
-- KPIs gerais (para o card superior do /admin)
CREATE OR REPLACE VIEW vw_dashboard AS
SELECT
  -- Vendas pagas/concluídas
  COALESCE((
    SELECT SUM(total_amount)
    FROM orders
    WHERE status IN ('paid','completed')
  ), 0) AS total_vendas,

  -- Produtos ativos
  (SELECT COUNT(*) FROM products WHERE is_active = TRUE) AS produtos_ativos,

  -- Clientes totais
  (SELECT COUNT(*) FROM customers) AS clientes;

-- Top produtos por saída (últimos 90 dias)
CREATE OR REPLACE VIEW vw_top_sellers_90d AS
SELECT
  oi.product_id,
  p.name,
  SUM(oi.quantity) AS qty_90d
FROM order_items oi
JOIN orders o   ON o.id = oi.order_id
JOIN products p ON p.id = oi.product_id
WHERE o.created_at >= NOW() - INTERVAL '90 days'
GROUP BY oi.product_id, p.name
ORDER BY qty_90d DESC;

COMMIT;

-- =====================================================================
-- SEEDS BÁSICOS (opcional): papéis + usuário admin
-- Rode APENAS 1 VEZ se o banco estiver vazio.
-- =====================================================================

-- Papéis
INSERT INTO roles(name) VALUES ('admin')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles(name) VALUES ('gestor')
ON CONFLICT (name) DO NOTHING;

INSERT INTO roles(name) VALUES ('vendedor')
ON CONFLICT (name) DO NOTHING;

-- Usuário admin (ajuste a senha se desejar)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower('admin@lumike.com')) THEN
    INSERT INTO users(name, email, password, role_id, is_active)
    VALUES ('Administrador', 'admin@lumike.com', '123456',
      (SELECT id FROM roles WHERE name='admin'), TRUE);
  END IF;
END$$;