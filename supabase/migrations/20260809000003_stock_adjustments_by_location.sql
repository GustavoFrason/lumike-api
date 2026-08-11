-- stock_adjustments existe desde o schema inicial (Nov/2025), com trigger
-- já funcionando (trf_stock_adjustments_ai -> fn_update_product_stock),
-- mas nunca foi usado por nenhuma tela/endpoint — pedido do usuário:
-- conferência física de estoque periódica (bater o que o sistema diz que
-- cada revendedora tem com o que ela realmente tem em mãos).
--
-- Faltava suporte a localidade: a tabela e o trigger só sabiam mexer no
-- estoque central (fn_update_product_stock sempre passa user_id NULL pra
-- fn_adjust_stock) — não existia esse conceito quando foram criados, de
-- antes do inventário multi-localidade (Mar/2026). Sem isso não dava pra
-- conferir o estoque de uma revendedora específica.
ALTER TABLE stock_adjustments
  ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS expected_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS counted_quantity INTEGER;

COMMENT ON COLUMN stock_adjustments.user_id IS 'NULL = Estoque Central. Revendedor(a) cuja localidade foi conferida/ajustada.';
COMMENT ON COLUMN stock_adjustments.expected_quantity IS 'Quantidade que o sistema apontava antes da conferência.';
COMMENT ON COLUMN stock_adjustments.counted_quantity IS 'Quantidade contada fisicamente na conferência.';

CREATE OR REPLACE FUNCTION trf_stock_adjustments_ai()
RETURNS TRIGGER AS $$
DECLARE v_ref TEXT;
BEGIN
  v_ref := 'adjust:' || NEW.id;
  PERFORM fn_adjust_stock(NEW.product_id, NEW.user_id, NEW.delta, v_ref, 'ADJUST');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
