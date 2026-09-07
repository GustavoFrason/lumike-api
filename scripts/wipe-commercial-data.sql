-- =====================================================================
-- LUMIKE — RESET COMERCIAL COMPLETO
-- =====================================================================
-- Apaga catálogo + toda a movimentação comercial (pedidos, compras,
-- pagamentos, fluxo de caixa, estoque) e reinicia a numeração de id.
--
-- Rodar UMA vez no SQL Editor do Supabase (projeto mzejzrtgolwkjhqxtdcr).
-- Pré-requisito: rodar antes  scripts/backup-before-wipe.ts
-- Depois:        rodar         scripts/wipe-produtos-storage.ts
--
-- MANTÉM: categories, colecoes, suppliers, customers, users, roles,
--         leads, site_settings, accessory_purchases, e produtos/categorias/*
--
-- Motivo do TRUNCATE (e não DELETE): order_items, purchase_items e
-- stock_adjustments têm FK ON DELETE RESTRICT para products — um
-- DELETE FROM products falharia. TRUNCATE ... CASCADE ignora o RESTRICT,
-- é transacional no Postgres (dá pra ROLLBACK), e RESTART IDENTITY zera
-- os contadores. Nenhum trigger dessas tabelas dispara em TRUNCATE.
-- =====================================================================


-- =====================================================================
-- BLOCO 0 — PREFLIGHT  (rode este bloco sozinho primeiro e confira)
-- =====================================================================

-- 0(a) contagem do que será apagado
SELECT 'products' AS tabela, count(*) FROM products
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'order_items', count(*) FROM order_items
UNION ALL SELECT 'order_payments', count(*) FROM order_payments
UNION ALL SELECT 'purchases', count(*) FROM purchases
UNION ALL SELECT 'purchase_items', count(*) FROM purchase_items
UNION ALL SELECT 'cash_flow', count(*) FROM cash_flow
UNION ALL SELECT 'stock_adjustments', count(*) FROM stock_adjustments
UNION ALL SELECT 'inventory_movements', count(*) FROM inventory_movements
UNION ALL SELECT 'inventory_locations', count(*) FROM inventory_locations
UNION ALL SELECT 'inventory_transfers', count(*) FROM inventory_transfers
UNION ALL SELECT 'stock_alerts', count(*) FROM stock_alerts
UNION ALL SELECT 'stock_notifications', count(*) FROM stock_notifications
UNION ALL SELECT 'product_favorites', count(*) FROM product_favorites
UNION ALL SELECT 'warranties', count(*) FROM warranties
UNION ALL SELECT 'imagens_produto', count(*) FROM imagens_produto
ORDER BY 1;

-- 0(b) o que É preservado (só pra registrar o "antes")
SELECT 'categories' AS tabela, count(*) FROM categories
UNION ALL SELECT 'colecoes', count(*) FROM colecoes
UNION ALL SELECT 'suppliers', count(*) FROM suppliers
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'leads', count(*) FROM leads
UNION ALL SELECT 'site_settings', count(*) FROM site_settings
UNION ALL SELECT 'accessory_purchases', count(*) FROM accessory_purchases
ORDER BY 1;

-- 0(c) TODA FK que aponta pro conjunto-alvo. Se aparecer uma tabela que
--      NÃO está no TRUNCATE do bloco 1, PARE e revise antes de continuar
--      (o CASCADE a apagaria junto, silenciosamente).
SELECT con.conrelid::regclass  AS tabela_referencia,
       con.confrelid::regclass AS tabela_alvo,
       con.confdeltype         AS on_delete  -- r=restrict c=cascade n=set null a=no action
FROM pg_constraint con
WHERE con.contype = 'f'
  AND con.confrelid::regclass::text IN (
    'products','orders','purchases','order_items','purchase_items',
    'order_payments','cash_flow','stock_adjustments','inventory_movements',
    'inventory_locations','inventory_transfers','stock_alerts',
    'stock_notifications','product_favorites','warranties','imagens_produto')
ORDER BY 2, 1;


-- =====================================================================
-- BLOCO 1 — WIPE  (selecione de BEGIN até o SELECT de confirmação,
--                  SEM o COMMIT, e rode)
-- =====================================================================
BEGIN;

TRUNCATE TABLE
  order_items,
  purchase_items,
  order_payments,
  cash_flow,
  stock_adjustments,
  inventory_movements,
  inventory_transfers,
  inventory_locations,
  stock_alerts,
  stock_notifications,
  product_favorites,
  warranties,
  imagens_produto,
  orders,
  purchases,
  products
RESTART IDENTITY CASCADE;

-- confirmação DENTRO da transação: todos devem ser 0
SELECT 'products' AS tabela, count(*) FROM products
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'order_items', count(*) FROM order_items
UNION ALL SELECT 'purchases', count(*) FROM purchases
UNION ALL SELECT 'purchase_items', count(*) FROM purchase_items
UNION ALL SELECT 'order_payments', count(*) FROM order_payments
UNION ALL SELECT 'cash_flow', count(*) FROM cash_flow
UNION ALL SELECT 'inventory_movements', count(*) FROM inventory_movements
UNION ALL SELECT 'inventory_locations', count(*) FROM inventory_locations
UNION ALL SELECT 'stock_alerts', count(*) FROM stock_alerts
UNION ALL SELECT 'warranties', count(*) FROM warranties
UNION ALL SELECT 'imagens_produto', count(*) FROM imagens_produto
ORDER BY 1;

-- Preservadas continuam intactas?
SELECT 'categories' AS tabela, count(*) FROM categories
UNION ALL SELECT 'colecoes', count(*) FROM colecoes
UNION ALL SELECT 'suppliers', count(*) FROM suppliers
UNION ALL SELECT 'customers', count(*) FROM customers
UNION ALL SELECT 'leads', count(*) FROM leads
ORDER BY 1;

-- >>> Se as tabelas-alvo deram 0, as preservadas seguem com os números do
-- >>> bloco 0, e o preflight 0(c) não mostrou tabela estranha: rode COMMIT.
-- >>> Caso contrário: rode ROLLBACK.
COMMIT;
-- ROLLBACK;


-- =====================================================================
-- BLOCO 2 — PÓS-CHECK: sequências reiniciadas (não consome id)
-- =====================================================================
SELECT 'products' AS tabela,
       pg_sequence_last_value(pg_get_serial_sequence('products','id')::regclass) AS last_value
UNION ALL SELECT 'orders',
       pg_sequence_last_value(pg_get_serial_sequence('orders','id')::regclass)
UNION ALL SELECT 'order_items',
       pg_sequence_last_value(pg_get_serial_sequence('order_items','id')::regclass)
UNION ALL SELECT 'purchases',
       pg_sequence_last_value(pg_get_serial_sequence('purchases','id')::regclass)
UNION ALL SELECT 'inventory_movements',
       pg_sequence_last_value(pg_get_serial_sequence('inventory_movements','id')::regclass);
-- last_value NULL em todas  =>  próximo id = 1  (correto)


-- =====================================================================
-- OPCIONAL — zerar também compras de insumos/embalagem (1 linha "teste",
-- sem relação com produtos). Descomente e rode à parte se quiser.
-- =====================================================================
-- TRUNCATE TABLE accessory_purchases RESTART IDENTITY;
