-- Combo de nº de parcelas na venda "Parcelado" (POS), substituindo o campo
-- livre "ID Transação/NSU" só nesse modo (Cartão à vista continua com o
-- campo de transaction_id, sem mudança). Regra: até 10x, parcela mínima de
-- R$50 — a mesma regra que já era anunciada na vitrine
-- (home-benefits-bar.tsx: "Até 6X Sem Juros... parcela mínima de R$50"),
-- mas que nunca teve validação de verdade em lugar nenhum do sistema.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS installments INTEGER;
COMMENT ON COLUMN orders.installments IS 'Número de parcelas do pagamento no cartão (venda "parcelado"); NULL para os demais métodos.';

-- CREATE OR REPLACE não basta: parâmetro novo muda a assinatura e o
-- Postgres trata como overload, não substituição — precisa dropar a
-- assinatura atual (18 params, de 20260809000002) primeiro.
DROP FUNCTION IF EXISTS fn_create_order(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT,
  TEXT, NUMERIC, TEXT, JSONB, NUMERIC, BIGINT, UUID, TEXT
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
  p_installments INTEGER DEFAULT NULL
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

  -- Mesma validação que o front já aplica ao montar o combo (nunca deixa
  -- escolher mais parcelas do que o total/50 permite) — repetida aqui pra
  -- não depender só do front: quem chamar fn_create_order direto (ou um
  -- front desatualizado) não consegue gravar parcela abaixo de R$50 nem
  -- fora do intervalo 1-10.
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
    installments, total_amount, notes
  ) VALUES (
    p_customer_id, p_seller_id, p_status::order_status, p_payment_method, p_payment_status,
    p_boca_value, p_boca_paid_now, p_boca_notes, p_card_brand, p_card_tax, p_transaction_id,
    p_installments, p_total_amount, p_notes
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
