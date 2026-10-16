-- ==========================================================================
-- Data real da compra (purchases.purchase_date)
-- ==========================================================================
-- Até aqui a compra só tinha `created_at`, o dia em que foi registrada no
-- sistema. A data escolhida na importação de planilha ("Data da Compra",
-- pode ser retroativa) ia só para os produtos novos. Ex.: a compra #4 foi
-- registrada em 08/10, mas é de 31/08.
--
-- A tela de etiquetas passa a oferecer "imprimir as etiquetas da compra de
-- dd/mm", então a compra precisa guardar a data dela.
--
--   1. Coluna nova `purchase_date`.
--   2. Compras antigas: data dos produtos criados NA MESMA TRANSAÇÃO da
--      compra. A importação grava compra e produtos novos numa função só,
--      então `products.created_at` = `purchases.created_at` (mesmo now()),
--      e esses produtos receberam a data escolhida na importação. Compra
--      sem produto novo (só entrada de estoque, ou compra manual): dia do
--      registro no fuso de Brasília.
--   3. Padrão = hoje em Brasília, e NOT NULL.
--   4. fn_import_purchase_excel grava a data na compra (mesmo corpo da
--      versão 20261010000002; muda só o INSERT INTO purchases).
-- ==========================================================================

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS purchase_date DATE;

UPDATE purchases pu
SET purchase_date = COALESCE(
  (
    SELECT MAX(p.purchase_date)
    FROM purchase_items pi
    JOIN products p ON p.id = pi.product_id
    WHERE pi.purchase_id = pu.id
      AND p.created_at = pu.created_at
  ),
  (pu.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE
)
WHERE pu.purchase_date IS NULL;

ALTER TABLE purchases
  ALTER COLUMN purchase_date SET DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo')::DATE),
  ALTER COLUMN purchase_date SET NOT NULL;

COMMENT ON COLUMN purchases.purchase_date IS
  'Data real da compra (pode ser anterior ao registro em created_at). Usada para listar as compras e imprimir as etiquetas de uma compra.';

-- --------------------------------------------------------------------------
-- fn_import_purchase_excel: grava a data na compra
-- --------------------------------------------------------------------------
-- Assinatura igual à de 20261010000002 (CREATE OR REPLACE mantém as
-- permissões). Todos os itens chegam com a mesma `purchase_date` (vem do
-- campo "Data da Compra" do importador); a da 1ª linha vai para a compra.
-- Sem data no item, vale o padrão da coluna (hoje em Brasília).
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
  --   "purchase_date": text|null,      -- 'YYYY-MM-DD': data da compra e dos produtos novos
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
  v_purchase_date DATE;
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

  v_purchase_date := COALESCE(
    NULLIF(p_items->0->>'purchase_date', '')::DATE,
    (now() AT TIME ZONE 'America/Sao_Paulo')::DATE
  );

  INSERT INTO purchases (supplier_id, notes, total_amount, purchase_date)
  VALUES (p_supplier_id, p_notes, v_total, v_purchase_date)
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
  'Importação de compra via planilha Excel: cria produtos novos (sku via trigger, current_stock nasce 0, is_active nasce true, sku2_alt opcional, price vem do item.price com fallback unit_cost×3) e/ou soma estoque em produtos existentes, tudo numa única compra atômica, com a data da compra (purchase_date do 1º item). Kits chegam já desmembrados em peças pela aplicação; total da compra usa item.total_cost (exato) quando presente. A trigger tg_purchase_items_ai -> fn_adjust_stock cuida do estoque.';
