-- Tabela de Favoritos
CREATE TABLE IF NOT EXISTS public.product_favorites (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Garante que o mesmo produto não é favoritado 2x pelo mesmo usuário
    UNIQUE(user_id, product_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_favorites_user ON public.product_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_product ON public.product_favorites(product_id);
