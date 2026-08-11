-- Importação de compra via planilha Excel da Zarpellon Joias
-- (substitui o import de XML/NF-e em /admin/compras/nova).
--
-- fn_import_purchase_excel cria, numa transação atômica só (uma função
-- plpgsql = uma transação Postgres inteira, sem risco de gravação parcial):
--   - produtos novos (sku fica a cargo do trigger fn_generate_product_sku,
--     que já existe — vira o id; current_stock nasce em 0, is_active/
--     is_featured em false);
--   - a linha de purchases + uma linha de purchase_items por item (novo ou
--     já existente) — o trigger tg_purchase_items_ai/fn_update_product_stock/
--     fn_adjust_stock, todos já existentes, disparam sozinhos e somam a
--     quantidade ao estoque central (inventory_locations com user_id NULL)
--     de forma atômica. É o mesmo mecanismo de qualquer compra manual, então
--     esta função não escreve estoque diretamente em lugar nenhum.
--
-- Produto novo nasce com current_stock = 0 (não a quantidade da planilha)
-- de propósito: se nascesse com a quantidade E o purchase_items também
-- somasse por cima via trigger, o estoque dobraria. É o INSERT em
-- purchase_items que efetivamente leva o estoque à quantidade da planilha.
--
-- Para item de produto já existente, a função NÃO faz UPDATE nenhum em
-- products — nome, descrição, preço e custo do produto existente ficam
-- intocados; só a entrada de compra (purchase_items) é gravada.
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
  --   "unit_cost": numeric
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
        (v_item->>'unit_cost')::NUMERIC * 3,
        (v_item->>'unit_cost')::NUMERIC,
        NULLIF(v_item->>'category_id', '')::BIGINT,
        p_supplier_id,
        COALESCE(NULLIF(v_item->>'purchase_date', '')::DATE, CURRENT_DATE),
        0,
        FALSE,
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
  'Importação de compra via planilha Excel da Zarpellon: cria produtos novos (sku via trigger, current_stock nasce 0) e/ou soma estoque em produtos existentes (sem tocar nome/descrição/preço), tudo dentro de uma única compra (purchases/purchase_items), em uma transação atômica só — a mesma trigger de compra manual (tg_purchase_items_ai -> fn_adjust_stock) cuida do estoque.';

GRANT EXECUTE ON FUNCTION fn_import_purchase_excel TO postgres, service_role;

-- --------------------------------------------------------------------------
-- Listas editáveis (sem alterar código) usadas pelo parser da planilha.
-- Ambas em site_settings, mesma tabela genérica key-value já usada por
-- import_price_multiplier/config do site. ON CONFLICT DO NOTHING para não
-- sobrescrever se você já tiver customizado antes de rodar esta migration.
-- Editar depois é direto no SQL Editor do Supabase (UPDATE site_settings
-- SET value = '...' WHERE key = '...').
-- --------------------------------------------------------------------------
INSERT INTO site_settings (key, value, description) VALUES
  (
    'import_excel_ignore_keywords',
    'SACOLA,MALETA,CAIXA,ETIQUETA,DISPLAY,EMBALAGEM',
    'Lista separada por vírgula de palavras (procuradas em qualquer parte da descrição, sem diferenciar maiúscula/minúscula) que marcam uma linha da planilha de compra como item de uso interno/embalagem — não vira produto de venda. Usado pelo import de compra via Excel (Zarpellon).'
  ),
  (
    'import_excel_category_keywords',
    '{"ANEL":"Aneis","BRINCO":"Brincos","PIERCING":"Piercings","CORRENTE":"Colares","COLAR":"Colares","PULSEIRA":"Pulseiras"}',
    'Dicionário JSON (palavra-chave -> nome de categoria) usado para sugerir automaticamente a categoria de um produto novo durante o import de compra via Excel (Zarpellon), casando com a primeira palavra-chave com que a descrição da planilha começa. Se a categoria não existir no catálogo (ex: "Piercings"), o produto cai em "A classificar".'
  )
ON CONFLICT (key) DO NOTHING;
