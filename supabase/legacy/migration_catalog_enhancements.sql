-- Adiciona campo para destacar produtos na página inicial
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

-- Adiciona campo para imagem da categoria
ALTER TABLE categories ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Indexação para busca rápida de produtos em destaque
CREATE INDEX IF NOT EXISTS idx_products_is_featured ON products(is_featured) WHERE is_featured = TRUE;
