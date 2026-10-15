-- ==========================================================================
-- Transferência de peças em lote entre estoques
-- ==========================================================================
-- Antes só existia fn_transfer_stock (uma peça por vez). Para montar ou
-- recolher a mala de uma revendedora, a tela de "Transferências em lote"
-- manda a lista inteira de uma vez (planilha Código + Quantidade, ou "tudo
-- que está com a revendedora") e fn_transfer_stock_batch move tudo em UMA
-- transação: se o estoque de uma peça mudou desde a prévia, nada é
-- transferido.
--
-- Cada lote fica registrado (quem, quando, origem → destino, observação)
-- para o histórico e o romaneio. As linhas continuam em inventory_transfers
-- (agora com batch_id), então o extrato do acerto com a revendedora já
-- enxerga as peças enviadas/devolvidas sem mudança nenhuma.
--
-- RLS ligado e sem policies (acesso só pela API com service_role).
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.inventory_transfer_batches (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_user_id BIGINT REFERENCES public.users(id), -- NULL = Central
  to_user_id BIGINT REFERENCES public.users(id),   -- NULL = Central
  notes TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,     -- peças diferentes
  total_quantity INTEGER NOT NULL DEFAULT 0,  -- unidades
  created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_transfer_batches_locations_check
    CHECK (from_user_id IS DISTINCT FROM to_user_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_transfer_batches_created
  ON public.inventory_transfer_batches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_batches_from
  ON public.inventory_transfer_batches (from_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_transfer_batches_to
  ON public.inventory_transfer_batches (to_user_id, created_at DESC);

ALTER TABLE public.inventory_transfers
  ADD COLUMN IF NOT EXISTS batch_id BIGINT
    REFERENCES public.inventory_transfer_batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by BIGINT
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_transfers_batch
  ON public.inventory_transfers (batch_id);

ALTER TABLE public.inventory_transfer_batches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.inventory_transfer_batches FROM anon, authenticated;
GRANT ALL ON public.inventory_transfer_batches TO service_role;

-- --------------------------------------------------------------------------
-- fn_transfer_stock_batch: move vários produtos de uma localidade para
-- outra numa transação só.
--
-- p_items: [{ "product_id": 1, "quantity": 2 }, ...] — o mesmo produto
-- repetido é somado. Os itens são processados em ordem de product_id para
-- dois lotes simultâneos não travarem um ao outro (deadlock).
--
-- Erros de negócio (a API transforma em 400):
--   INVALID_TRANSFER:    origem = destino, lista vazia, quantidade inválida
--   INSUFFICIENT_STOCK:  vem de fn_adjust_stock (nome + disponível + pedido)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_transfer_stock_batch(
  p_from_user_id BIGINT,
  p_to_user_id BIGINT,
  p_notes TEXT,
  p_created_by BIGINT,
  p_items JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_batch_id BIGINT;
  v_item RECORD;
  v_total_items INTEGER := 0;
  v_total_quantity INTEGER := 0;
BEGIN
  IF p_from_user_id IS NOT DISTINCT FROM p_to_user_id THEN
    RAISE EXCEPTION 'INVALID_TRANSFER: origem e destino precisam ser diferentes';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_TRANSFER: nenhuma peça para transferir';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS e
     WHERE (e->>'product_id') IS NULL
        OR (e->>'quantity') IS NULL
        OR (e->>'quantity') !~ '^[0-9]+$'
        OR (e->>'quantity')::INTEGER <= 0
  ) THEN
    RAISE EXCEPTION 'INVALID_TRANSFER: quantidade inválida em um ou mais itens';
  END IF;

  INSERT INTO inventory_transfer_batches (from_user_id, to_user_id, notes, created_by)
  VALUES (p_from_user_id, p_to_user_id, NULLIF(TRIM(p_notes), ''), p_created_by)
  RETURNING id INTO v_batch_id;

  FOR v_item IN
    SELECT (e->>'product_id')::BIGINT AS product_id,
           SUM((e->>'quantity')::INTEGER)::INTEGER AS quantity
      FROM jsonb_array_elements(p_items) AS e
     GROUP BY 1
     ORDER BY 1
  LOOP
    PERFORM fn_adjust_stock(
      v_item.product_id, p_from_user_id, -v_item.quantity,
      'transfer_out:lote:' || v_batch_id
    );
    PERFORM fn_adjust_stock(
      v_item.product_id, p_to_user_id, v_item.quantity,
      'transfer_in:lote:' || v_batch_id
    );

    INSERT INTO inventory_transfers
      (product_id, from_user_id, to_user_id, quantity, notes, batch_id, created_by)
    VALUES
      (v_item.product_id, p_from_user_id, p_to_user_id, v_item.quantity,
       NULLIF(TRIM(p_notes), ''), v_batch_id, p_created_by);

    v_total_items := v_total_items + 1;
    v_total_quantity := v_total_quantity + v_item.quantity;
  END LOOP;

  UPDATE inventory_transfer_batches
     SET total_items = v_total_items,
         total_quantity = v_total_quantity
   WHERE id = v_batch_id;

  RETURN v_batch_id;
END;
$$;

COMMENT ON FUNCTION fn_transfer_stock_batch IS
  'Transferência de vários produtos entre duas localidades numa transação só (lote com histórico).';

REVOKE ALL ON FUNCTION fn_transfer_stock_batch FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fn_transfer_stock_batch TO postgres, service_role;
