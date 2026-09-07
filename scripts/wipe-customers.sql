-- =====================================================================
-- LUMIKE — ZERAR CLIENTES (tabela customers / CRM)
-- =====================================================================
-- Complemento do reset comercial (wipe-commercial-data.sql). Rodar no
-- SQL Editor do Supabase depois daquele, quando orders/warranties já
-- estão vazios.
--
-- NÃO mexe em:
--   - users (contas de login, incl. as de role 'customer') — customers.user_id
--     é só um vínculo; apagar o cliente não apaga o login.
--   - leads (captação de cupom do site).
--
-- Preflight já rodado (2026-09-07): as únicas FKs pra customers são
--   orders.customer_id  (ON DELETE SET NULL)   -> orders vazia
--   warranties.customer_id (ON DELETE CASCADE) -> warranties vazia
-- ou seja o CASCADE abaixo não apaga dado nenhum além de customers.
-- =====================================================================

-- 0. confira as FKs (se aparecer tabela que não seja orders/warranties, PARE)
SELECT con.conrelid::regclass AS tabela_referencia,
       con.confdeltype        AS on_delete  -- n=set null  c=cascade  r=restrict
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.confrelid = 'customers'::regclass;

-- 0. contagem antes
SELECT count(*) AS customers_antes FROM customers;

-- 1. wipe
BEGIN;

TRUNCATE TABLE customers RESTART IDENTITY CASCADE;

SELECT count(*) AS customers_depois FROM customers;   -- deve ser 0

COMMIT;
-- ROLLBACK;

-- 2. pós-check: sequência reiniciada (próximo cliente = id 1)
SELECT pg_sequence_last_value(pg_get_serial_sequence('customers','id')::regclass) AS last_value;
-- last_value NULL  =>  próximo id = 1
