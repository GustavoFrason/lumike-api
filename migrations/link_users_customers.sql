-- Adicionar coluna user_id na tabela customers para vincular com login
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON public.customers(user_id);
