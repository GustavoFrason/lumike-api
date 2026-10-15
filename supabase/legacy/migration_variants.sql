-- Migration: Product Variants Support (Corrected for BigInt)

-- 1. Create Product Variants Table
create table product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id bigint references products(id) on delete cascade, -- CORRIGIDO: Referência como BigInt
  name text not null, -- Ex: "Aro 14", "Banho Ouro", "Prata - 16"
  sku text,
  price_adjustment decimal(10,2) default 0,
  stock int default 0, -- Adicionado explicitamente caso não tenha ficado claro
  created_at timestamptz default now()
);

-- 2. Update Inventory Table to support Variants
-- Adiciona variant_id à tabela de estoque existente
-- Nota: Se 'estoque' usa UUID ou BigInt para id, não importa, variant_id é UUID.
alter table estoque 
add column variant_id uuid references product_variants(id) on delete cascade;

-- 3. Update Order Items to support Variants
alter table order_items 
add column variant_id uuid references product_variants(id);
