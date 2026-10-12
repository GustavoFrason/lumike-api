-- ==========================================================================
-- fn_import_purchase_excel: 2º código do fornecedor e total exato com kits
-- ==========================================================================
-- Duas mudanças em relação a 20260913000001 (CREATE OR REPLACE inteiro, a
-- assinatura não muda — as permissões existentes continuam valendo):
--
--   1. Produto novo grava `sku2_alt` (2º código da Zarpellon) quando a
--      aplicação manda — antes a coluna não existia.
--   2. Kits: a aplicação agora desmembra "kit de N peças iguais" antes de
--      chamar a função (quantity = kits × N, unit_cost = custo do kit ÷ N,
--      arredondado em centavos). Como o custo por peça é arredondado, a
--      soma quantity × unit_cost pode diferir de centavos do que foi pago;
--      o total da compra passa a usar `total_cost` do item (= kits × custo
--      do kit, valor exato) quando vier, com o cálculo antigo como fallback.
--
-- Compatível com a API anterior: sem `sku2_alt`/`total_cost` no item, o
-- comportamento é idêntico ao da versão 20260913000001.
-- ==========================================================================
CREATE OR REPLACE FUNCTION fn_import_purchase_excel(
  p_supplier_id BIGINT,
  p_notes TEXT,
  -- cada elemento de p_items:
  -- {
  --   "is_new": bool,
  --   "product_id": bigint|null,      -- obrigatório quando is_new = false
  --   "sku2": text|null,               -- obrigatório quando is_new = true
  --   "sku2_alt": text|null,           -- opcional, só usado quando is_new = true
  --   "name": text|null,               -- obrigatório quando is_new = true
  --   "category_id": bigint|null,      -- só usado quando is_new = true
  --   "purchase_date": text|null,      -- 'YYYY-MM-DD', só usado quando is_new = true
  --   "quantity": int,                 -- em PEÇAS (kit já desmembrado pela aplicação)
  --   "unit_cost": numeric,            -- custo por PEÇA
  --   "total_cost": numeric|null,      -- valor pago pela linha (exato); fallback quantity × unit_cost
  --   "price": numeric|null            -- só usado quando is_new = true; nulo/vazio cai no fallback unit_cost×3
  -- }
  p_items JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_id BIGINT;
  v_item JSONB;
  v_product_id BIGINT;
  v_total NUMERIC(12,2);
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Importação precisa ter ao menos um item';
  END IF;

  SELECT COALESCE(SUM(
    COALESCE(
      NULLIF(elem->>'total_cost', '')::NUMERIC,
      (elem->>'quantity')::INTEGER * (elem->>'unit_cost')::NUMERIC
    )
  ), 0)
    INTO v_total
  FROM jsonb_array_elements(p_items) elem;

  INSERT INTO purchases (supplier_id, notes, total_amount)
  VALUES (p_supplier_id, p_notes, v_total)
  RETURNING id INTO v_purchase_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF COALESCE((v_item->>'is_new')::BOOLEAN, FALSE) THEN
      IF COALESCE(v_item->>'sku2', '') = '' THEN
        RAISE EXCEPTION 'sku2 é obrigatório para novo produto (nome: %)', v_item->>'name';
      END IF;
      IF COALESCE(v_item->>'name', '') = '' THEN
        RAISE EXCEPTION 'name é obrigatório para novo produto (sku2: %)', v_item->>'sku2';
      END IF;

      INSERT INTO products (
        sku2, sku2_alt, name, short_description, description, price, cost_price,
        category_id, supplier_id, purchase_date, current_stock, is_active, is_featured
      ) VALUES (
        v_item->>'sku2',
        NULLIF(trim(COALESCE(v_item->>'sku2_alt', '')), ''),
        v_item->>'name',
        '.',
        v_item->>'name',
        COALESCE(NULLIF(v_item->>'price', '')::NUMERIC, (v_item->>'unit_cost')::NUMERIC * 3),
        (v_item->>'unit_cost')::NUMERIC,
        NULLIF(v_item->>'category_id', '')::BIGINT,
        p_supplier_id,
        COALESCE(NULLIF(v_item->>'purchase_date', '')::DATE, CURRENT_DATE),
        0,
        TRUE,
        FALSE
      ) RETURNING id INTO v_product_id;
    ELSE
      v_product_id := NULLIF(v_item->>'product_id', '')::BIGINT;

      IF v_product_id IS NULL OR NOT EXISTS (SELECT 1 FROM products WHERE id = v_product_id) THEN
        RAISE EXCEPTION 'product_id inválido para item de atualização de estoque: %', v_item->>'product_id';
      END IF;
    END IF;

    INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost)
    VALUES (
      v_purchase_id,
      v_product_id,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_cost')::NUMERIC
    );
  END LOOP;

  RETURN v_purchase_id;
END;
$$;

COMMENT ON FUNCTION fn_import_purchase_excel IS
  'Importação de compra via planilha Excel da Zarpellon: cria produtos novos (sku via trigger, current_stock nasce 0, is_active nasce true, sku2_alt opcional, price vem do item.price com fallback unit_cost×3) e/ou soma estoque em produtos existentes, tudo numa única compra atômica. Kits chegam já desmembrados em peças pela aplicação; total da compra usa item.total_cost (exato) quando presente. A trigger tg_purchase_items_ai -> fn_adjust_stock cuida do estoque.';
