-- Corrige um gap real: o preço sugerido no preview da importação de planilha
-- (NewProductRow.suggested_price) já era exibido e "editável" no front, mas
-- nunca chegava até aqui — fn_import_purchase_excel sempre recalculava
-- unit_cost×3 sozinha, ignorando qualquer edição feita no preview. Pedido
-- que trouxe isso à tona: usuário quer subir planilha com uma coluna de
-- "Valor de Venda" já precificada, e esse valor precisa realmente ser usado.
--
-- CREATE OR REPLACE inteiro porque é assim que este projeto corrige funções
-- já aplicadas em produção (nunca edita migration antiga) — a única mudança
-- de verdade é o `price` do INSERT de produto novo: antes hardcoded
-- unit_cost×3, agora usa o item.price vindo da aplicação (que já é
-- unit_cost×3 quando a planilha não tinha "Valor de Venda"), com o mesmo
-- cálculo como fallback se price vier nulo/vazio por algum motivo.
CREATE OR REPLACE FUNCTION fn_import_purchase_excel(
  p_supplier_id BIGINT,
  p_notes TEXT,
  -- cada elemento de p_items:
  -- {
  --   "is_new": bool,
  --   "product_id": bigint|null,      -- obrigatório quando is_new = false
  --   "sku2": text|null,               -- obrigatório quando is_new = true (valor literal da célula, sem normalização)
  --   "name": text|null,               -- obrigatório quando is_new = true
  --   "category_id": bigint|null,      -- só usado quando is_new = true
  --   "purchase_date": text|null,      -- 'YYYY-MM-DD', só usado quando is_new = true
  --   "quantity": int,
  --   "unit_cost": numeric,
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

  SELECT COALESCE(SUM((elem->>'quantity')::INTEGER * (elem->>'unit_cost')::NUMERIC), 0)
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
        sku2, name, short_description, description, price, cost_price,
        category_id, supplier_id, purchase_date, current_stock, is_active, is_featured
      ) VALUES (
        v_item->>'sku2',
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
  'Importação de compra via planilha Excel da Zarpellon: cria produtos novos (sku via trigger, current_stock nasce 0, is_active nasce true, price vem do item.price — planilha ou regra unit_cost×3 calculada na aplicação, com o mesmo fallback aqui se vier nulo) e/ou soma estoque em produtos existentes (sem tocar nome/descrição/preço), tudo dentro de uma única compra (purchases/purchase_items), em uma transação atômica só — a mesma trigger de compra manual (tg_purchase_items_ai -> fn_adjust_stock) cuida do estoque.';
