-- Nenhum produto tinha slug: nem o form de "Novo Produto" no admin nem a
-- importação de XML/XLSX jamais preenchiam esse campo. Como a página
-- pública é /produtos/[slug] (não /produtos/[id]), isso significa que o
-- catálogo inteiro está inacessível no site (achado testando
-- localhost:3002/produtos/11 — "produto não encontrado" mesmo o produto
-- existindo e aparecendo no admin).
--
-- Gera o slug automaticamente a partir do nome sempre que ele vier vazio,
-- com o id como sufixo — garante unicidade sem precisar de lookup (evita a
-- classe de bug de race condition que já corrigimos em estoque/pedidos).
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION fn_generate_product_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := trim(both '-' from regexp_replace(lower(unaccent(NEW.name)), '[^a-z0-9]+', '-', 'g')) || '-' || NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_products_generate_slug ON products;
CREATE TRIGGER tg_products_generate_slug
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION fn_generate_product_slug();

-- Backfill: produtos existentes sem slug (hoje, todos).
UPDATE products
SET slug = trim(both '-' from regexp_replace(lower(unaccent(name)), '[^a-z0-9]+', '-', 'g')) || '-' || id
WHERE slug IS NULL;
