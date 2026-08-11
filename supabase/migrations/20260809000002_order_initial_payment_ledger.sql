-- fn_create_order grava o sinal/pagamento inicial (p_paid_now) só em
-- cash_flow, nunca em order_payments. Como AccountsReceivableService.
-- getCustomerStatement() só lê créditos de order_payments (não de
-- cash_flow), o sinal pago na hora da venda nunca aparecia no extrato do
-- cliente nem era descontado do saldo devedor — achado auditando Contas a
-- Receber (venda de R$39,99 com R$10 de sinal aparecia como R$39,99 de
-- dívida, e o extrato não mostrava o pagamento de R$10 em lugar nenhum).
--
-- O saldo devedor em si (boca_value) já foi corrigido no lado do NestJS
-- (OrdersService.create passa value - paid_now, não o valor bruto).
--
-- CREATE OR REPLACE não basta aqui: adicionar um parâmetro novo (mesmo com
-- DEFAULT) muda a assinatura, e o Postgres trata isso como um *overload*
-- novo em vez de substituir a função antiga — precisa dropar a assinatura
-- velha explicitamente primeiro, senão ficam duas fn_create_order e todo
-- GRANT/chamada sem cast fica ambíguo.
DROP FUNCTION IF EXISTS fn_create_order(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT,
  TEXT, NUMERIC, TEXT, JSONB, NUMERIC, BIGINT, UUID
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
  p_receiver_name TEXT DEFAULT NULL
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

  INSERT INTO orders (
    customer_id, seller_id, status, payment_method, payment_status,
    boca_value, boca_paid_now, boca_notes, card_brand, card_tax, transaction_id,
    total_amount, notes
  ) VALUES (
    p_customer_id, p_seller_id, p_status::order_status, p_payment_method, p_payment_status,
    p_boca_value, p_boca_paid_now, p_boca_notes, p_card_brand, p_card_tax, p_transaction_id,
    p_total_amount, p_notes
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

    PERFORM fn_adjust_stock(
      (v_item->>'product_id')::BIGINT,
      p_seller_id,
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
