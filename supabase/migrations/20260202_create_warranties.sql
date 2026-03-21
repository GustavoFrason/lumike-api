-- Create Warranty Status Enum
CREATE TYPE warranty_status AS ENUM ('pending', 'analyzing', 'factory', 'ready', 'finished', 'rejected');

-- Create Warranty Type Enum
CREATE TYPE warranty_type AS ENUM ('plating', 'break', 'stone_loss', 'other');

-- Create Warranties Table
CREATE TABLE warranties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status warranty_status NOT NULL DEFAULT 'pending',
    type warranty_type NOT NULL DEFAULT 'other',
    description TEXT,
    internal_notes TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

-- Indices for faster lookups
CREATE INDEX idx_warranties_customer_id ON warranties(customer_id);
CREATE INDEX idx_warranties_status ON warranties(status);
CREATE INDEX idx_warranties_product_id ON warranties(product_id);

-- Trigger to update updated_at
CREATE TRIGGER set_timestamp_warranties
BEFORE UPDATE ON warranties
FOR EACH ROW
EXECUTE PROCEDURE set_updated_at();
