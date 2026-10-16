-- ==========================================================================
-- Contato de vendas e chave Pix configuráveis
-- ==========================================================================
-- Antes, o número do WhatsApp (botão "Pedir no WhatsApp", botão flutuante
-- da vitrine) e a chave Pix da mensagem de cobrança de fiado estavam fixos
-- no código, com valores de exemplo. Agora vêm de site_settings e são
-- editados em /admin/configuracoes → "Dados da Loja".
--
-- Começam vazios: sem número configurado a vitrine esconde os botões de
-- WhatsApp (melhor que mandar o cliente para um número falso), e a cobrança
-- sai sem a linha do Pix.
--
-- Os dois valores são públicos por natureza (vão para o cliente), e o
-- GET /settings da API é público — não guarde nada sigiloso nesta tabela.
--
-- ON CONFLICT DO NOTHING para não sobrescrever se já existirem. A tabela já
-- tem RLS ligado e sem policies (20261009000001_rls_lockdown_public_schema).
-- ==========================================================================

INSERT INTO site_settings (key, value, description) VALUES
  (
    'whatsapp_number',
    '',
    'Número de WhatsApp de vendas, só dígitos, com DDI e DDD (ex: 5511987654321). Usado nos botões de WhatsApp da vitrine. Vazio = botões escondidos.'
  ),
  (
    'pix_key',
    '',
    'Chave Pix enviada na mensagem de cobrança de fiado (Clientes a Pagar). Vazio = mensagem sai sem a chave.'
  )
ON CONFLICT (key) DO NOTHING;
