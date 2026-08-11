-- SKU (Principal) deixa de ser digitado: o auto-incremento `id` já é um
-- identificador único por natureza, então ele passa a ser o "código interno
-- da plataforma" exibido (somente leitura) no admin. Quem passa a ser
-- obrigatório é `sku2` ("SKU Zarpellon") — o código real da peça no
-- fornecedor.
--
-- Mesmo padrão de fn_generate_product_slug (20260809000001): só preenche
-- `sku` quando vier vazio, nunca sobrescreve um valor já existente — os
-- produtos antigos mantêm o SKU que já foi digitado manualmente (pode estar
-- impresso em etiqueta física de verdade, não é seguro trocar sozinho).
CREATE OR REPLACE FUNCTION fn_generate_product_sku()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.sku IS NULL OR NEW.sku = '' THEN
    NEW.sku := NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_products_generate_sku ON products;
CREATE TRIGGER tg_products_generate_sku
BEFORE INSERT OR UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION fn_generate_product_sku();
