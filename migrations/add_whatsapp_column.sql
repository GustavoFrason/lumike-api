-- Adicionar coluna whatsapp na tabela users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- (Opcional) Adicionar comentário
COMMENT ON COLUMN public.users.whatsapp IS 'Número de WhatsApp do usuário para contato e notificaçòes';
