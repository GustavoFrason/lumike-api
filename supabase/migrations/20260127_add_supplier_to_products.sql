-- Migration: Add supplier_id to products table
-- To support ROI per Supplier analysis

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS supplier_id BIGINT REFERENCES suppliers(id) ON DELETE SET NULL;

COMMENT ON COLUMN products.supplier_id IS 'Default supplier for this product (for ROI analysis)';
