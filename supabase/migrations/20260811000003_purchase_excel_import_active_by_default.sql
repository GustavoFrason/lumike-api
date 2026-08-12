-- Ajuste de comportamento (não é fix de bug): produto novo criado pela
-- importação de planilha Excel nascia com is_active = false (conforme o
-- de/para original). Na prática isso deixava o produto "sumido" pro
-- usuário logo após confirmar a importação — a tela /admin/produtos
-- filtra só ativos, sem nenhum jeito hoje de listar/ativar inativos ali.
-- Decisão: nasce ativo por padrão. is_featured continua false (destaque é
-- uma escolha separada, sem relação com esse problema).
--
-- CREATE OR REPLACE inteiro porque é assim que este projeto corrige
-- funções já aplicadas em produção (nunca edita a migration antiga) — só
-- muda o valor de is_active no INSERT de produto novo, o resto é idêntico
-- a 20260811000001_purchase_excel_import.sql.
CREATE OR REPLACE FUNCTION fn_import_purchase_excel(
  p_supplier_id BIGINT,
  p_notes TEXT,
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
        (v_item->>'unit_cost')::NUMERIC * 3,
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
  'Importação de compra via planilha Excel da Zarpellon: cria produtos novos (sku via trigger, current_stock nasce 0, is_active nasce true) e/ou soma estoque em produtos existentes (sem tocar nome/descrição/preço), tudo dentro de uma única compra (purchases/purchase_items), em uma transação atômica só — a mesma trigger de compra manual (tg_purchase_items_ai -> fn_adjust_stock) cuida do estoque.';
