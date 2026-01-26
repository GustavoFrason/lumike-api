-- =====================================================================
-- LUMIKE - Adiciona tabelas e campos faltantes conforme documentação
-- Tabelas novas: colecoes, imagens_produto, estoque separado
-- Campos novos: slug, preco_promocional
-- =====================================================================

BEGIN;

-- ---------- COLEÇÕES (nova tabela com UUID) -------------------------
CREATE TABLE IF NOT EXISTS colecoes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  descricao     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_colecoes_slug ON colecoes(slug);
CREATE INDEX IF NOT EXISTS idx_colecoes_active ON colecoes(is_active);

DROP TRIGGER IF EXISTS tg_colecoes_updated_at ON colecoes;
CREATE TRIGGER tg_colecoes_updated_at
BEFORE UPDATE ON colecoes
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- ADICIONAR SLUG E PRECO_PROMOCIONAL EM PRODUCTS ----------
-- Adiciona slug se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'slug'
  ) THEN
    ALTER TABLE products ADD COLUMN slug TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
  END IF;
END$$;

-- Adiciona preco_promocional se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'preco_promocional'
  ) THEN
    ALTER TABLE products ADD COLUMN preco_promocional NUMERIC(12,2);
  END IF;
END$$;

-- Adiciona colecao_id se não existir (será BIGINT por enquanto, migraremos depois)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'products' AND column_name = 'colecao_id'
  ) THEN
    -- Por enquanto não adicionamos FK pois colecoes usa UUID
    -- Será necessário migrar products para UUID primeiro
    ALTER TABLE products ADD COLUMN colecao_id UUID;
    CREATE INDEX IF NOT EXISTS idx_products_colecao ON products(colecao_id);
  END IF;
END$$;

-- ---------- IMAGENS DE PRODUTO (nova tabela com UUID) ---------------
CREATE TABLE IF NOT EXISTS imagens_produto (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id    BIGINT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  url           TEXT NOT NULL,
  ordem         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_imagens_produto_produto ON imagens_produto(produto_id);
CREATE INDEX IF NOT EXISTS idx_imagens_produto_ordem ON imagens_produto(produto_id, ordem);

-- ---------- ESTOQUE SEPARADO (nova tabela com UUID) -----------------
-- Conforme documentação, estoque deve ser uma tabela separada
CREATE TABLE IF NOT EXISTS estoque (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id    BIGINT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  quantidade    INTEGER NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(produto_id) -- Um registro de estoque por produto
);

CREATE INDEX IF NOT EXISTS idx_estoque_produto ON estoque(produto_id);

DROP TRIGGER IF EXISTS tg_estoque_updated_at ON estoque;
CREATE TRIGGER tg_estoque_updated_at
BEFORE UPDATE ON estoque
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- ADICIONAR SLUG EM CATEGORIAS ----------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categories' AND column_name = 'slug'
  ) THEN
    ALTER TABLE categories ADD COLUMN slug TEXT UNIQUE;
    CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
  END IF;
END$$;

-- ---------- FUNÇÃO PARA SINCRONIZAR ESTOQUE --------------------------
-- Sincroniza estoque separado com current_stock de products
CREATE OR REPLACE FUNCTION sync_estoque_from_products()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO estoque (produto_id, quantidade, updated_at)
  VALUES (NEW.id, NEW.current_stock, NOW())
  ON CONFLICT (produto_id)
  DO UPDATE SET 
    quantidade = NEW.current_stock,
    updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para manter estoque sincronizado com products
DROP TRIGGER IF EXISTS tg_products_sync_estoque ON products;
CREATE TRIGGER tg_products_sync_estoque
AFTER INSERT OR UPDATE OF current_stock ON products
FOR EACH ROW EXECUTE FUNCTION sync_estoque_from_products();

-- Migrar dados existentes de current_stock para estoque
INSERT INTO estoque (produto_id, quantidade, updated_at)
SELECT id, current_stock, updated_at
FROM products
WHERE current_stock > 0
ON CONFLICT (produto_id) DO NOTHING;

COMMIT;

