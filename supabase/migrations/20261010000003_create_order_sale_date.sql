-- ==========================================================================
-- fn_create_order: venda com data passada e venda da "mala" da revendedora
-- ==========================================================================
-- Dois parâmetros novos (com default — a API atual continua funcionando):
--
--   * p_sale_date: lançar depois uma venda já feita (pedido do Léo). A data
--     vale para orders.created_at e para os lançamentos de caixa/pagamento
--     desta venda. NULL = agora. Quem pode usar e quais datas valem é
--     decidido na API (só admin/gestor, não futura, não antes do início do
--     fluxo de caixa). O estoque sai na hora (inventory_movements = agora).
--
--   * p_record_cash: FALSE quando a venda sai do estoque de uma revendedora
--     — o dinheiro fica com ela e só entra no caixa da loja no ACERTO
--     (reseller_settlements). Sem isso o caixa contaria duas vezes. O
--     pagamento continua registrado em order_payments (a venda segue
--     "paga" para contas a receber).
--
-- DROP + CREATE dentro de uma transação: assinatura nova (mudar a lista de
-- parâmetros cria uma sobrecarga em vez de substituir), e sem transação a
-- função ficaria inexistente por um instante — vendas no PDV falhariam.
-- No fim deve existir exatamente UMA fn_create_order (duas sobrecargas
-- fazem o PostgREST recusar a chamada: "could not choose candidate").
-- ==========================================================================
BEGIN;

DROP FUNCTION IF EXISTS fn_create_order(
  BIGINT, BIGINT, TEXT, TEXT, TEXT, NUMERIC, TEXT, NUMERIC, NUMERIC, TEXT,
  TEXT, NUMERIC, TEXT, JSONB, NUMERIC, BIGINT, UUID, TEXT, INTEGER, BIGINT
);

CREATE FUNCTION fn_create_order(
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
  p_stock_location_user_id BIGINT DEFAULT NULL,
  p_sale_date TIMESTAMPTZ DEFAULT NULL,
  p_record_cash BOOLEAN DEFAULT TRUE
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id BIGINT;
  v_item JSONB;
  v_at TIMESTAMPTZ := COALESCE(p_sale_date, NOW());
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
    installments, stock_location_user_id, total_amount, notes, created_at
  ) VALUES (
    p_customer_id, p_seller_id, p_status::order_status, p_payment_method, p_payment_status,
    p_boca_value, p_boca_paid_now, p_boca_notes, p_card_brand, p_card_tax, p_transaction_id,
    p_installments, p_stock_location_user_id, p_total_amount, p_notes, v_at
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

    -- Só p_stock_location_user_id decide de qual localidade o estoque sai
    -- (comissão = orders.seller_id, escolha independente).
    PERFORM fn_adjust_stock(
      (v_item->>'product_id')::BIGINT,
      p_stock_location_user_id,
      -((v_item->>'quantity')::INTEGER),
      'order:' || v_order_id
    );
  END LOOP;

  IF p_paid_now IS NOT NULL AND p_paid_now > 0 THEN
    IF p_record_cash THEN
      INSERT INTO cash_flow (type, category, amount, description, order_id, user_id, created_at)
      VALUES ('IN', 'venda', p_paid_now, 'Pagamento inicial Pedido #' || v_order_id, v_order_id, p_cash_user_id, v_at);
    END IF;

    INSERT INTO order_payments (order_id, amount, payment_method, type, notes, receiver_name, created_at)
    VALUES (
      v_order_id, p_paid_now, p_payment_method, 'payment',
      CASE WHEN p_record_cash THEN 'Pagamento inicial na venda'
           ELSE 'Pagamento recebido pela revendedora (entra no caixa no acerto)' END,
      COALESCE(p_receiver_name, 'Sistema'),
      v_at
    );
  END IF;

  IF p_lead_id IS NOT NULL THEN
    UPDATE leads SET is_used = TRUE WHERE id = p_lead_id AND is_used = FALSE;
  END IF;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION fn_create_order IS
  'Cria pedido + itens + baixa de estoque (de p_stock_location_user_id; NULL = Central) + pagamento inicial, atomicamente. p_sale_date (NULL = agora) data a venda e seus lançamentos; p_record_cash = FALSE não lança no caixa (venda da mala de revendedora — entra no acerto).';

REVOKE ALL ON FUNCTION fn_create_order FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_create_order TO service_role;

-- Relatórios e acerto filtram por data e por estoque de origem
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_orders_stock_location ON public.orders (stock_location_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders (seller_id, created_at);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Conferência (deve voltar exatamente 1 linha):
-- SELECT oid::regprocedure FROM pg_proc WHERE proname = 'fn_create_order';
