-- ==========================================================================
-- MIGRATION: Estoque e pedidos atômicos
-- Data: 04/08/2026
--
-- Contexto / bug encontrado durante a refatoração:
--   1. `fn_update_product_stock` (init schema) fazia UPDATE + INSERT sem
--      nenhuma guarda contra saldo negativo — e o backend fazia o mesmo em
--      JS (ler quantidade, comparar, escrever), o que é uma condição de
--      corrida clássica: duas vendas simultâneas do último item podiam
--      ambas passar da checagem antes de qualquer UPDATE ser commitado.
--   2. Pior: havia DUAS fontes de baixa de estoque para pedidos ao mesmo
--      tempo — o trigger `tg_order_items_ai` (que só mexe em
--      `products.current_stock`) E o `InventoryService.removeStock` do
--      NestJS (que mexe em `inventory_locations` e, quando a venda é do
--      estoque central, TAMBÉM em `products.current_stock`). Resultado:
--      toda venda do estoque central baixava `current_stock` DUAS vezes.
--   3. Compras (`purchase_items`) só somavam em `products.current_stock`
--      via trigger, nunca em `inventory_locations` — ou seja, desde que o
--      estoque por localidade existe, toda compra fazia os dois números
--      (current_stock vs. soma de inventory_locations) divergirem mais.
--
-- Esta migration consolida tudo em UMA função (`fn_adjust_stock`), que:
--   - é a única a escrever em `inventory_locations` e `inventory_movements`;
--   - garante atomicidade via UPDATE condicional (`WHERE quantity+delta>=0`),
--     eliminando a corrida de leitura-depois-escrita;
--   - mantém `products.current_stock` como cache sincronizado apenas da
--     localidade central (user_id IS NULL) — o mesmo papel que já tinha.
--
-- `fn_update_product_stock` continua existindo (chamada pelos triggers de
-- compra e ajuste manual) mas agora delega para `fn_adjust_stock`.
--
-- Os triggers de `order_items` são removidos: a baixa de estoque de pedidos
-- passa a acontecer só dentro de `fn_create_order`/`fn_cancel_order`, que
-- sabem a localidade certa (vendedor da venda), coisa que o trigger nunca
-- soube fazer.
--
-- Aplicação: cole este arquivo no SQL Editor do Supabase Dashboard do
-- projeto, ou rode `supabase db push` se tiver o projeto linkado local.
-- Precisa ser aplicado ANTES de subir o backend com o código desta mesma
-- refatoração (OrdersService/InventoryService passam a chamar estas
-- funções via `supabase.rpc(...)`).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 0. Índice único parcial para o caso de estoque central (user_id NULL).
--    UNIQUE(product_id, user_id) já existe (migration de multi-localidade)
--    mas não pega esse caso — NULL nunca conflita com NULL em uma
--    constraint UNIQUE padrão. Sem isso, fn_adjust_stock pode inserir
--    linhas centrais duplicadas sob concorrência (ou até em uso sequencial
--    normal — ver função abaixo).
-- --------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_inventory_locations_central
  ON inventory_locations (product_id)
  WHERE user_id IS NULL;

-- --------------------------------------------------------------------------
-- 1. Função central: ajusta estoque de UMA localidade de forma atômica.
-- --------------------------------------------------------------------------
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
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'p_delta não pode ser zero (produto %)', p_product_id;
  END IF;

  -- Garante que a linha da localidade existe (0 na primeira movimentação).
  -- Se duas transações tentarem criar a mesma linha ao mesmo tempo, o
  -- ON CONFLICT DO NOTHING evita erro de duplicidade; a segunda só segue
  -- depois que a primeira commitar (lock do índice único).
  --
  -- Precisa de dois caminhos: a constraint UNIQUE(product_id, user_id) não
  -- pega o caso de estoque central (user_id IS NULL), porque NULL nunca é
  -- igual a NULL pra fins de unicidade — ON CONFLICT (product_id, user_id)
  -- nunca detecta conflito quando user_id é NULL, deixa inserir uma
  -- segunda linha "fantasma" com quantity=0, e o UPDATE...RETURNING INTO
  -- logo abaixo quebra com "query returned more than one row" ao achar as
  -- duas linhas para o mesmo produto. Usamos o índice único parcial
  -- ux_inventory_locations_central como arbiter só pro caso NULL.
  IF p_user_id IS NULL THEN
    INSERT INTO inventory_locations (product_id, user_id, quantity)
    VALUES (p_product_id, NULL, 0)
    ON CONFLICT (product_id) WHERE user_id IS NULL DO NOTHING;
  ELSE
    INSERT INTO inventory_locations (product_id, user_id, quantity)
    VALUES (p_product_id, p_user_id, 0)
    ON CONFLICT (product_id, user_id) DO NOTHING;
  END IF;

  -- Único UPDATE atômico: só aplica se o saldo resultante não ficar
  -- negativo. É isso — e não uma leitura prévia em JS — que elimina a
  -- condição de corrida em vendas concorrentes do mesmo produto.
  UPDATE inventory_locations
     SET quantity = quantity + p_delta,
         updated_at = NOW()
   WHERE product_id = p_product_id
     AND user_id IS NOT DISTINCT FROM p_user_id
     AND quantity + p_delta >= 0
  RETURNING quantity INTO v_new_quantity;

  IF v_new_quantity IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: produto % não tem saldo suficiente na localidade % para aplicar delta % (ref: %)',
      p_product_id, COALESCE(p_user_id::TEXT, 'central'), p_delta, p_reference;
  END IF;

  -- Cast explícito nos literais: sem ele, o COALESCE tenta unificar
  -- movement_type (p_movement_override) com text (a CASE sem cast) e o
  -- Postgres não tem cast implícito entre os dois — "COALESCE types
  -- movement_type and text cannot be matched" em tempo de execução.
  v_movement := COALESCE(p_movement_override, CASE WHEN p_delta > 0 THEN 'IN'::movement_type ELSE 'OUT'::movement_type END);
  INSERT INTO inventory_movements (product_id, movement, quantity, reference)
  VALUES (p_product_id, v_movement, p_delta, p_reference);

  -- products.current_stock é um cache de leitura rápida do estoque central.
  IF p_user_id IS NULL THEN
    UPDATE products SET current_stock = v_new_quantity, updated_at = NOW() WHERE id = p_product_id;
  END IF;

  RETURN v_new_quantity;
END;
$$;

COMMENT ON FUNCTION fn_adjust_stock IS
  'Fonte única de verdade para qualquer movimentação de estoque. Atômica: usa UPDATE condicional em vez de leitura-depois-escrita, então não sofre condição de corrida em concorrência.';

-- --------------------------------------------------------------------------
-- 2. fn_update_product_stock vira um shim de compatibilidade para os
--    triggers de compra e ajuste manual que já existiam — eles continuam
--    funcionando sem precisar ser reescritos, agora passando por
--    fn_adjust_stock (e, portanto, também sincronizando inventory_locations,
--    o que antes não acontecia para compras).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_update_product_stock(
  p_product_id BIGINT,
  p_delta INTEGER,
  p_reference TEXT,
  p_movement movement_type
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM fn_adjust_stock(p_product_id, NULL, p_delta, p_reference, p_movement);
END;
$$;

-- --------------------------------------------------------------------------
-- 3. Remove os triggers de order_items — baixa/devolução de estoque de
--    pedido agora é sempre explícita dentro de fn_create_order/fn_cancel_order,
--    que sabem a localidade correta (vendedor da venda). O trigger antigo só
--    sabia mexer no estoque central, causando dupla baixa quando o
--    InventoryService também descontava a localidade certa.
-- --------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tg_order_items_ai ON order_items;
DROP TRIGGER IF EXISTS tg_order_items_ad ON order_items;
DROP FUNCTION IF EXISTS trf_order_items_ai();
DROP FUNCTION IF EXISTS trf_order_items_ad();

-- --------------------------------------------------------------------------
-- 4. fn_create_order — cria pedido + itens + baixa de estoque + lançamento
--    de caixa (se houve pagamento) + baixa de cupom, tudo em uma transação
--    implícita só. Se qualquer item não tiver estoque suficiente, a função
--    inteira falha e NADA é gravado (nem o pedido, nem os outros itens).
-- --------------------------------------------------------------------------
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
  p_items JSONB,        -- [{ "product_id": 1, "quantity": 2, "unit_price": 99.9 }, ...]
  p_paid_now NUMERIC,    -- valor a lançar no fluxo de caixa agora (sinal ou total)
  p_cash_user_id BIGINT, -- quem operou a venda, para o lançamento de caixa
  p_lead_id UUID DEFAULT NULL -- lead do cupom aplicado, se houver
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

    -- Baixa atômica na localidade de quem vendeu (vendedor ou central).
    -- Se não houver saldo, fn_adjust_stock levanta exceção e todo o
    -- fn_create_order é desfeito — nenhum pedido "meio criado" fica no banco.
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
  END IF;

  IF p_lead_id IS NOT NULL THEN
    UPDATE leads SET is_used = TRUE WHERE id = p_lead_id AND is_used = FALSE;
  END IF;

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION fn_create_order IS
  'Cria pedido + itens + baixa de estoque + caixa em uma transação atômica. Substitui a sequência de 4 chamadas separadas que o OrdersService.create fazia antes.';

-- --------------------------------------------------------------------------
-- 5. fn_cancel_order — espelha OrdersService.cancelOrder: marca cancelado,
--    registra estorno no caixa e em order_payments, devolve estoque de cada
--    item para a localidade original. FOR UPDATE trava a linha do pedido
--    para evitar cancelamento duplicado em concorrência.
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
  SELECT id, status, seller_id, notes INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;

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
    PERFORM fn_adjust_stock(v_item.product_id, v_order.seller_id, v_item.quantity, 'order-cancel:' || p_order_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION fn_cancel_order IS
  'Cancela pedido + estorno de caixa + devolução de estoque em uma transação atômica.';

-- --------------------------------------------------------------------------
-- 6. fn_transfer_stock — move estoque entre duas localidades (ex: central
--    para a mala de um vendedor) em uma única transação: se a saída da
--    origem funcionar mas a entrada no destino falhar por algum motivo, a
--    função inteira desfaz a saída também (antes, InventoryService.transferStock
--    fazia removeStock + addStock como duas chamadas HTTP separadas — uma
--    falha no meio deixava o produto "sumido" das duas localidades).
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_transfer_stock(
  p_product_id BIGINT,
  p_from_user_id BIGINT,
  p_to_user_id BIGINT,
  p_quantity INTEGER,
  p_notes TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_from_user_id IS NOT DISTINCT FROM p_to_user_id THEN
    RAISE EXCEPTION 'Origem e destino não podem ser iguais';
  END IF;

  PERFORM fn_adjust_stock(p_product_id, p_from_user_id, -p_quantity, 'transfer_out:' || COALESCE(p_to_user_id::TEXT, 'central'));
  PERFORM fn_adjust_stock(p_product_id, p_to_user_id, p_quantity, 'transfer_in:' || COALESCE(p_from_user_id::TEXT, 'central'));

  INSERT INTO inventory_transfers (product_id, from_user_id, to_user_id, quantity, notes)
  VALUES (p_product_id, p_from_user_id, p_to_user_id, p_quantity, p_notes);
END;
$$;

COMMENT ON FUNCTION fn_transfer_stock IS
  'Transferência atômica entre duas localidades — saída e entrada acontecem na mesma transação.';

-- --------------------------------------------------------------------------
-- 7. View de saldo do fluxo de caixa — soma agregada no Postgres em vez de
--    o backend trazer a tabela `cash_flow` inteira para somar em JS
--    (CashFlowService.getBalance / DashboardService.calculateKPIs).
-- --------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_cash_flow_balance AS
SELECT COALESCE(SUM(CASE WHEN type = 'IN' THEN amount ELSE -amount END), 0) AS balance
FROM cash_flow;

-- --------------------------------------------------------------------------
-- 8. Permissões — o backend chama tudo isso com a service_role key.
-- --------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION fn_adjust_stock TO postgres, service_role;
GRANT EXECUTE ON FUNCTION fn_update_product_stock TO postgres, service_role;
GRANT EXECUTE ON FUNCTION fn_create_order TO postgres, service_role;
GRANT EXECUTE ON FUNCTION fn_cancel_order TO postgres, service_role;
GRANT EXECUTE ON FUNCTION fn_transfer_stock TO postgres, service_role;
GRANT SELECT ON vw_cash_flow_balance TO postgres, authenticated, service_role;
