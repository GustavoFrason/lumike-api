-- Remove tabelas mortas: zero referência em todo o código (backend e
-- frontend) e nenhuma outra tabela tem FK apontando pra elas — confirmado
-- via grep no código e introspecção do schema real de produção.
--
-- payments: superada por order_payments (fluxo de pagamento de pedido
-- atual usa essa; a `payments` era do desenho inicial do schema, antes de
-- order_payments existir).
--
-- estoque: superada por inventory_locations/inventory_movements (fluxo de
-- estoque multi-localidade atual). `estoque` era do desenho inicial,
-- anterior ao suporte a múltiplas localidades (central + revendedoras).
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS estoque CASCADE;

-- Os enums payment_method/payment_status só eram usados pela coluna
-- correspondente em `payments` — orders.payment_method/payment_status
-- sempre foram TEXT livre, não esse enum. Órfãos agora que a tabela sumiu.
DROP TYPE IF EXISTS payment_method;
DROP TYPE IF EXISTS payment_status;
