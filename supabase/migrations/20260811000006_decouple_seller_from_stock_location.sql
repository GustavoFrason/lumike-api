-- "Vendedor (Comissão)" na tela de venda (POS) mandava seller_id, e
-- fn_create_order usava esse MESMO parâmetro pra duas coisas: orders.seller_id
-- (quem recebe a comissão) E a localidade de onde fn_adjust_stock desconta
-- o estoque. Resultado: escolher alguém só pra crédito de comissão fazia a
-- venda tentar descontar do estoque PESSOAL daquela pessoa (normalmente
-- vazio, já que produto entra direto no Central) — "estoque insuficiente"
-- mesmo com saldo de sobra no Central. Achado num caso real: produto com 8
-- unidades no Central, erro dizendo "disponível: 0".
--
-- Correção: stock_location_user_id é uma coluna nova, independente de
-- seller_id, mesma convenção de inventory_locations.user_id/fn_adjust_stock
-- (NULL = Estoque Central). seller_id continua só sobre comissão.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_location_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;
COMMENT ON COLUMN orders.stock_location_user_id IS 'De qual localidade (inventory_locations) o estoque desta venda foi descontado. NULL = Estoque Central. Independente de seller_id (que é só sobre comissão).';

-- Backfill: todo pedido já existente teve o estoque descontado de
-- seller_id (era o único parâmetro usado pra isso até agora) — é
-- literalmente o valor certo pra história antiga. Sem isso,
-- fn_cancel_order devolveria pro Central em vez de pra onde saiu de
-- verdade, quebrando o saldo de estoque de qualquer pedido velho
-- cancelado depois desta migration.
UPDATE orders SET stock_location_user_id = seller_id WHERE stock_location_user_id IS NULL;

-- --------------------------------------------------------------------------
-- fn_create_order: DROP explícito na assinatura atual de 19 parâmetros
-- (parâmetro novo vira overload, não substituição, mesmo motivo de sempre).
-- --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS fn_create_order(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT,
  TEXT, NUMERIC, TEXT, JSONB, NUMERIC, BIGINT, UUID, TEXT, INTEGER
);

CREATE OR REPLACE FUNCTION fn_create_order(
  p_customer_id BIGINT,
  p_seller_id BIGINT,
  p_status TEXT,
  p_payment_method TEXT,
  p_payment_status TEXT,
  p_total_amount NUMERIC,
  p_notes TEXT,
  p_boca_value NUMERIC,
  p_boca_paid_now NUMERIC,
  p_boca_notes TEXT,
  p_card_brand TEXT,
  p_card_tax NUMERIC,
  p_transaction_id TEXT,
  p_items JSONB,
  p_paid_now NUMERIC,
  p_cash_user_id BIGINT,
  p_lead_id UUID DEFAULT NULL,
  p_receiver_name TEXT DEFAULT NULL,
  p_installments INTEGER DEFAULT NULL,
  p_stock_location_user_id BIGINT DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id BIGINT;
  v_item JSONB;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Pedido precisa ter ao menos um item';
  END IF;

  IF p_installments IS NOT NULL THEN
    IF p_installments < 1 OR p_installments > 10 THEN
      RAISE EXCEPTION 'Número de parcelas inválido (permitido: 1 a 10)';
    END IF;
    IF p_installments > 1 AND (p_total_amount / p_installments) < 50 THEN
      RAISE EXCEPTION 'Parcela mínima de R$ 50,00 não respeitada para % parcelas', p_installments;
    END IF;
  END IF;

  INSERT INTO orders (
    customer_id, seller_id, status, payment_method, payment_status,
    boca_value, boca_paid_now, boca_notes, card_brand, card_tax, transaction_id,
    installments, stock_location_user_id, total_amount, notes
  ) VALUES (
    p_customer_id, p_seller_id, p_status::order_status, p_payment_method, p_payment_status,
    p_boca_value, p_boca_paid_now, p_boca_notes, p_card_brand, p_card_tax, p_transaction_id,
    p_installments, p_stock_location_user_id, p_total_amount, p_notes
  ) RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, product_id, quantity, unit_price)
    VALUES (
      v_order_id,
      (v_item->>'product_id')::BIGINT,
      (v_item->>'quantity')::INTEGER,
      (v_item->>'unit_price')::NUMERIC
    );

    -- p_seller_id NÃO entra mais aqui — só p_stock_location_user_id decide
    -- de qual localidade o estoque sai. Comissão (orders.seller_id, acima)
    -- e localidade de estoque agora são escolhas independentes.
    PERFORM fn_adjust_stock(
      (v_item->>'product_id')::BIGINT,
      p_stock_location_user_id,
      -((v_item->>'quantity')::INTEGER),
      'order:' || v_order_id
    );
  END LOOP;

  IF p_paid_now IS NOT NULL AND p_paid_now > 0 THEN
    INSERT INTO cash_flow (type, category, amount, description, order_id, user_id)
    VALUES ('IN', 'venda', p_paid_now, 'Pagamento inicial Pedido #' || v_order_id, v_order_id, p_cash_user_id);

    INSERT INTO order_payments (order_id, amount, payment_method, type, notes, receiver_name)
    VALUES (v_order_id, p_paid_now, p_payment_method, 'payment', 'Pagamento inicial na venda', COALESCE(p_receiver_name, 'Sistema'));
  END IF;

  IF p_lead_id IS NOT NULL THEN
    UPDATE leads SET is_used = TRUE WHERE id = p_lead_id AND is_used = FALSE;
  END IF;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_create_order TO postgres, authenticated, service_role;

-- --------------------------------------------------------------------------
-- fn_cancel_order: mesma assinatura de sempre (5 parâmetros, sem mudança) —
-- só o corpo muda, pra devolver estoque pra stock_location_user_id em vez
-- de seller_id.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_cancel_order(
  p_order_id BIGINT,
  p_refund_amount NUMERIC,
  p_notes TEXT,
  p_user_id BIGINT,
  p_receiver_name TEXT DEFAULT 'Sistema'
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_order RECORD;
  v_item RECORD;
BEGIN
  SELECT id, status, stock_location_user_id, notes INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido % não encontrado', p_order_id;
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Pedido já está cancelado';
  END IF;

  UPDATE orders
     SET status = 'cancelled',
         notes = COALESCE(v_order.notes, '') || ' | CANCELADO: ' || COALESCE(p_notes, '') ||
                 ' (Estorno: R$' || COALESCE(p_refund_amount, 0) || ')',
         updated_at = NOW()
   WHERE id = p_order_id;

  IF p_refund_amount IS NOT NULL AND p_refund_amount > 0 THEN
    INSERT INTO cash_flow (type, category, amount, description, order_id, user_id)
    VALUES ('OUT', 'estorno', p_refund_amount, 'Estorno Pedido #' || p_order_id || ': ' || COALESCE(p_notes, ''), p_order_id, p_user_id);

    INSERT INTO order_payments (order_id, amount, payment_method, type, notes, receiver_name)
    VALUES (p_order_id, p_refund_amount, 'estorno', 'refund', p_notes, COALESCE(p_receiver_name, 'Sistema'));
  END IF;

  FOR v_item IN SELECT product_id, quantity FROM order_items WHERE order_id = p_order_id
  LOOP
    PERFORM fn_adjust_stock(v_item.product_id, v_order.stock_location_user_id, v_item.quantity, 'order-cancel:' || p_order_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION fn_cancel_order IS
  'Cancela pedido + estorno de caixa + devolução de estoque em uma transação atômica. Devolve pra stock_location_user_id (de onde o estoque realmente saiu), não pra seller_id (que é só comissão).';

GRANT EXECUTE ON FUNCTION fn_cancel_order TO postgres, authenticated, service_role;
