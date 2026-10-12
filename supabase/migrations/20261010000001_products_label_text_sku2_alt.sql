-- ==========================================================================
-- Produtos: texto da etiqueta, 2º código do fornecedor e ordenação por código
-- ==========================================================================
-- Pedidos de quem etiqueta as peças:
--   * label_text: linha extra impressa na etiqueta (ex: "LINHA PRATA",
--     "ARO 16", "45cm") — antes era escrita à mão. O app limita a 24
--     caracteres (cabe na etiqueta Joia 27x15mm); o CHECK aqui é mais
--     folgado de propósito, só para barrar lixo.
--   * sku2_alt: a Zarpellon tem 2 códigos para alguns produtos e a busca /
--     importação não achava o produto pela 2ª referência.
--   * sku_sort: `sku` é TEXT ("10" < "7" em ordem de texto). Coluna gerada
--     com o valor numérico do código, para listar "em ordem crescente". SKU
--     não numérico (cadastro antigo digitado à mão) fica NULL e vai pro fim.
--     Colunas geradas são calculadas depois dos triggers BEFORE, então o
--     trigger que preenche sku = id continua valendo.
--
-- Idempotente. Depois de aplicar, rode NOTIFY (no fim) para o PostgREST
-- enxergar as colunas novas.
-- ==========================================================================

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS label_text TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku2_alt TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku_sort BIGINT
  GENERATED ALWAYS AS (
    CASE WHEN sku ~ '^[0-9]{1,18}$' THEN sku::BIGINT END
  ) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_label_text_length'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_label_text_length
      CHECK (label_text IS NULL OR char_length(label_text) <= 40);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_sku2 ON public.products (sku2);
CREATE INDEX IF NOT EXISTS idx_products_sku2_alt ON public.products (sku2_alt)
  WHERE sku2_alt IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_sku_sort ON public.products (sku_sort, id);

COMMENT ON COLUMN public.products.label_text IS
  'Texto extra impresso na etiqueta (ex: LINHA PRATA, ARO 16, 45cm). App limita a 24 caracteres.';
COMMENT ON COLUMN public.products.sku2_alt IS
  'Segundo código do fornecedor (Zarpellon), usado na busca e na importação de planilha.';
COMMENT ON COLUMN public.products.sku_sort IS
  'Valor numérico de sku (NULL se não numérico) — ordenação "em ordem crescente".';

NOTIFY pgrst, 'reload schema';
