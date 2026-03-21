-- Expand Warranties for Repairs (Concerto)
-- This migration allows tracking repairs for both sold items and stock items.

BEGIN;

-- 1. Create Warranty Origin Enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warranty_origin') THEN
    CREATE TYPE warranty_origin AS ENUM ('sold', 'stock');
  END IF;
END$$;

-- 2. Modify warranties table
-- First, ensure all IDs are BIGINT to match the rest of the schema
ALTER TABLE warranties ALTER COLUMN customer_id TYPE BIGINT;
ALTER TABLE warranties ALTER COLUMN product_id TYPE BIGINT;
ALTER TABLE warranties ALTER COLUMN order_id TYPE BIGINT;

-- Make customer_id nullable (for stock repairs)
ALTER TABLE warranties ALTER COLUMN customer_id DROP NOT NULL;

-- 3. Add origin column
ALTER TABLE warranties ADD COLUMN IF NOT EXISTS origin warranty_origin NOT NULL DEFAULT 'sold';

-- 4. Update existing records to have 'sold' origin if they have a customer_id
UPDATE warranties SET origin = 'sold' WHERE customer_id IS NOT NULL;

-- 5. Add internal field for repair-specific data if needed (already have description and images)
-- We'll use the existing 'images' JSONB column for defect photos as planned.

COMMIT;
