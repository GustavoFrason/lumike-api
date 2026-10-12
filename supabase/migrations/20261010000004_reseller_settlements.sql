-- ==========================================================================
-- Acerto com revendedora
-- ==========================================================================
-- Regra (definida com o dono): a revendedora recebe dos clientes, fica com
-- a comissão (users.commission_rate, % sobre o que ela vendeu) e repassa à
-- loja o resto.
--
--   recebido     = soma das vendas que saíram da MALA dela
--                  (orders.stock_location_user_id = ela) — o dinheiro está com ela
--   comissão     = commission_rate × soma das vendas em que ELA É A VENDEDORA
--                  (orders.seller_id = ela)
--   a repassar   = recebido − comissão  (negativo = a loja deve a ela)
--
-- Cada venda entra em no máximo UM acerto (UNIQUE em order_id) — não dá
-- para contar a mesma venda duas vezes, nem com períodos sobrepostos.
--
-- Caixa: o acerto lança só a DIFERENÇA entre o valor pago e o que essas
-- vendas já tinham lançado no caixa. Vendas novas da mala não lançam caixa
-- na hora (fn_create_order com p_record_cash = FALSE), então entra o valor
-- pago inteiro. Vendas antigas (antes desta mudança) já tinham lançado o
-- total na hora da venda; aí a diferença sai como comissão. Sem isso o
-- caixa contaria duas vezes.
--
-- RLS ligado e sem policies (acesso só pela API com service_role).
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.reseller_settlements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reseller_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  period_start DATE,
  period_end DATE NOT NULL,
  orders_count INTEGER NOT NULL DEFAULT 0,
  pieces_count INTEGER NOT NULL DEFAULT 0,
  -- recebido pela revendedora (vendas da mala dela)
  sales_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- base da comissão (vendas em que ela é a vendedora)
  commission_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_rate NUMERIC(5,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- a repassar à loja (negativo = loja deve a ela)
  amount_due NUMERIC(12,2) NOT NULL,
  -- efetivamente pago (positivo = ela pagou a loja; negativo = loja pagou a ela)
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  notes TEXT,
  cash_flow_id INTEGER REFERENCES public.cash_flow(id) ON DELETE SET NULL,
  created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reseller_settlements_period_check
    CHECK (period_start IS NULL OR period_start <= period_end)
);

CREATE TABLE IF NOT EXISTS public.reseller_settlement_orders (
  settlement_id BIGINT NOT NULL REFERENCES public.reseller_settlements(id) ON DELETE CASCADE,
  order_id BIGINT NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  reseller_user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (settlement_id, order_id),
  -- cada venda entra em no máximo um acerto
  CONSTRAINT reseller_settlement_orders_order_unique UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_reseller_settlements_reseller
  ON public.reseller_settlements (reseller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reseller_settlement_orders_reseller
  ON public.reseller_settlement_orders (reseller_user_id);

-- inventory_transfers era gravada mas nunca lida — o extrato do acerto lê
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_to
  ON public.inventory_transfers (to_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_transfers_from
  ON public.inventory_transfers (from_user_id, created_at);

ALTER TABLE public.reseller_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_settlement_orders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.reseller_settlements, public.reseller_settlement_orders
  FROM anon, authenticated;
GRANT ALL ON public.reseller_settlements, public.reseller_settlement_orders
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.reseller_settlements_id_seq TO service_role;

-- --------------------------------------------------------------------------
-- fn_create_reseller_settlement: registra o acerto de forma atômica.
-- p_expected_amount_due = o "a repassar" que a tela mostrou; se as vendas
-- mudaram desde o extrato (cancelamento, venda nova...), recusa
-- (STALE_STATEMENT) para a pessoa recarregar e conferir.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_reseller_settlement(
  p_reseller BIGINT,
  p_period_start DATE,
  p_period_end DATE,
  p_order_ids BIGINT[],
  p_amount_paid NUMERIC,
  p_payment_method TEXT,
  p_notes TEXT,
  p_created_by BIGINT,
  p_expected_amount_due NUMERIC
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_ids BIGINT[] := COALESCE(p_order_ids, ARRAY[]::BIGINT[]);
  v_found INTEGER;
  v_rate NUMERIC(5,2);
  v_collected NUMERIC(12,2);
  v_commission_base NUMERIC(12,2);
  v_commission NUMERIC(12,2);
  v_due NUMERIC(12,2);
  v_pieces INTEGER;
  v_already_in_cash NUMERIC(12,2);
  v_cash_delta NUMERIC(12,2);
  v_cash_flow_id INTEGER;
  v_settlement_id BIGINT;
BEGIN
  IF p_period_end IS NULL THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: período sem data final';
  END IF;

  -- Trava as vendas do acerto (nada muda nelas até o fim da transação)
  PERFORM 1 FROM orders WHERE id = ANY(v_order_ids) FOR UPDATE;

  SELECT COUNT(*) INTO v_found
  FROM orders
  WHERE id = ANY(v_order_ids)
    AND status <> 'cancelled'
    AND (seller_id = p_reseller OR stock_location_user_id = p_reseller);

  IF v_found <> COALESCE(array_length(v_order_ids, 1), 0) THEN
    RAISE EXCEPTION 'STALE_STATEMENT: há vendas canceladas, inexistentes ou de outra pessoa no acerto';
  END IF;

  IF EXISTS (SELECT 1 FROM reseller_settlement_orders WHERE order_id = ANY(v_order_ids)) THEN
    RAISE EXCEPTION 'STALE_STATEMENT: alguma venda já foi acertada';
  END IF;

  SELECT COALESCE(commission_rate, 20) INTO v_rate FROM users WHERE id = p_reseller;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_SETTLEMENT: revendedora % não encontrada', p_reseller;
  END IF;

  SELECT
    COALESCE(SUM(total_amount) FILTER (WHERE stock_location_user_id = p_reseller), 0),
    COALESCE(SUM(total_amount) FILTER (WHERE seller_id = p_reseller), 0)
  INTO v_collected, v_commission_base
  FROM orders
  WHERE id = ANY(v_order_ids);

  v_commission := ROUND(v_commission_base * v_rate / 100, 2);
  v_due := ROUND(v_collected - v_commission, 2);

  IF ABS(v_due - COALESCE(p_expected_amount_due, v_due)) > 0.009 THEN
    RAISE EXCEPTION 'STALE_STATEMENT: valor a repassar mudou (era %, agora %)', p_expected_amount_due, v_due;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_pieces
  FROM order_items WHERE order_id = ANY(v_order_ids);

  INSERT INTO reseller_settlements (
    reseller_user_id, period_start, period_end, orders_count, pieces_count,
    sales_total, commission_base, commission_rate, commission_amount,
    amount_due, amount_paid, payment_method, notes, created_by
  ) VALUES (
    p_reseller, p_period_start, p_period_end, COALESCE(array_length(v_order_ids, 1), 0), v_pieces,
    v_collected, v_commission_base, v_rate, v_commission,
    v_due, COALESCE(p_amount_paid, 0), p_payment_method, p_notes, p_created_by
  ) RETURNING id INTO v_settlement_id;

  INSERT INTO reseller_settlement_orders (settlement_id, order_id, reseller_user_id)
  SELECT v_settlement_id, unnest(v_order_ids), p_reseller;

  -- Quanto destas vendas da mala JÁ entrou no caixa (vendas antigas
  -- lançavam o total na hora). O acerto lança só a diferença.
  SELECT COALESCE(SUM(CASE WHEN cf.type = 'IN' THEN cf.amount ELSE -cf.amount END), 0)
    INTO v_already_in_cash
  FROM cash_flow cf
  JOIN orders o ON o.id = cf.order_id
  WHERE cf.order_id = ANY(v_order_ids)
    AND o.stock_location_user_id = p_reseller;

  v_cash_delta := ROUND(COALESCE(p_amount_paid, 0) - v_already_in_cash, 2);

  IF v_cash_delta > 0 THEN
    INSERT INTO cash_flow (type, category, amount, description, user_id)
    VALUES ('IN', 'acerto', v_cash_delta,
            'Acerto #' || v_settlement_id || ' com revendedora #' || p_reseller, p_created_by)
    RETURNING id INTO v_cash_flow_id;
  ELSIF v_cash_delta < 0 THEN
    INSERT INTO cash_flow (type, category, amount, description, user_id)
    VALUES ('OUT', 'comissao', -v_cash_delta,
            'Acerto #' || v_settlement_id || ' com revendedora #' || p_reseller || ' (comissão)', p_created_by)
    RETURNING id INTO v_cash_flow_id;
  END IF;

  IF v_cash_flow_id IS NOT NULL THEN
    UPDATE reseller_settlements SET cash_flow_id = v_cash_flow_id WHERE id = v_settlement_id;
  END IF;

  RETURN v_settlement_id;
END;
$$;

COMMENT ON FUNCTION fn_create_reseller_settlement IS
  'Registra acerto com revendedora: trava e valida as vendas, calcula recebido/comissão/a repassar, impede venda acertada duas vezes e lança no caixa só a diferença do que essas vendas já tinham lançado.';

REVOKE ALL ON FUNCTION fn_create_reseller_settlement FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_create_reseller_settlement TO service_role;

NOTIFY pgrst, 'reload schema';
