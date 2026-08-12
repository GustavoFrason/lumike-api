-- fn_adjust_stock já detectava estoque insuficiente certinho, mas a
-- mensagem só tinha o id numérico do produto — toda camada acima (Orders/
-- InventoryService) jogava fora esse detalhe e mostrava um texto genérico
-- tipo "Estoque insuficiente para um ou mais itens do pedido.", sem dizer
-- qual produto nem quanto tinha disponível. Como fn_adjust_stock é o
-- caminho único de qualquer movimentação de estoque (venda, compra,
-- ajuste manual, transferência), essa mensagem melhorada vale pra tudo que
-- passa por ele, não só a tela de vendas.
--
-- Mesma assinatura de sempre — CREATE OR REPLACE sem DROP FUNCTION (só
-- texto da exceção mudou, não os parâmetros).
--
-- O prefixo "INSUFFICIENT_STOCK:" continua igual de propósito: é nele que
-- OrdersService/InventoryService detectam esse erro de negócio específico
-- (vs. erro genérico de banco) — só o texto depois do prefixo mudou, de
-- "produto 42 não tem saldo..." pra algo que já pode ir direto pra tela.
CREATE OR REPLACE FUNCTION fn_adjust_stock(
  p_product_id BIGINT,
  p_user_id BIGINT,              -- NULL = estoque central
  p_delta INTEGER,                -- positivo = entrada, negativo = saída
  p_reference TEXT DEFAULT NULL,
  p_movement_override movement_type DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_quantity INTEGER;
  v_movement movement_type;
  v_current_qty INTEGER;
  v_product_name TEXT;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'p_delta não pode ser zero (produto %)', p_product_id;
  END IF;

  IF p_user_id IS NULL THEN
    INSERT INTO inventory_locations (product_id, user_id, quantity)
    VALUES (p_product_id, NULL, 0)
    ON CONFLICT (product_id) WHERE user_id IS NULL DO NOTHING;
  ELSE
    INSERT INTO inventory_locations (product_id, user_id, quantity)
    VALUES (p_product_id, p_user_id, 0)
    ON CONFLICT (product_id, user_id) DO NOTHING;
  END IF;

  UPDATE inventory_locations
     SET quantity = quantity + p_delta,
         updated_at = NOW()
   WHERE product_id = p_product_id
     AND user_id IS NOT DISTINCT FROM p_user_id
     AND quantity + p_delta >= 0
  RETURNING quantity INTO v_new_quantity;

  IF v_new_quantity IS NULL THEN
    SELECT il.quantity, p.name
      INTO v_current_qty, v_product_name
    FROM products p
    LEFT JOIN inventory_locations il
      ON il.product_id = p.id AND il.user_id IS NOT DISTINCT FROM p_user_id
    WHERE p.id = p_product_id;

    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para "%" — disponível: %, solicitado: %',
      COALESCE(v_product_name, 'produto #' || p_product_id),
      COALESCE(v_current_qty, 0),
      abs(p_delta);
  END IF;

  v_movement := COALESCE(p_movement_override, CASE WHEN p_delta > 0 THEN 'IN'::movement_type ELSE 'OUT'::movement_type END);
  INSERT INTO inventory_movements (product_id, movement, quantity, reference)
  VALUES (p_product_id, v_movement, p_delta, p_reference);

  IF p_user_id IS NULL THEN
    UPDATE products SET current_stock = v_new_quantity, updated_at = NOW() WHERE id = p_product_id;
  END IF;

  RETURN v_new_quantity;
END;
$$;

COMMENT ON FUNCTION fn_adjust_stock IS
  'Fonte única de verdade para qualquer movimentação de estoque. Atômica: usa UPDATE condicional em vez de leitura-depois-escrita, então não sofre condição de corrida em concorrência. Mensagem de INSUFFICIENT_STOCK já vem pronta pra exibir (nome do produto + disponível + solicitado).';
