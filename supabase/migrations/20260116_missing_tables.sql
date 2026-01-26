-- Drop tables to reset schema with correct references
DROP TABLE IF EXISTS public.accessory_purchases;
DROP TABLE IF EXISTS public.stock_notifications;
DROP TABLE IF EXISTS public.product_favorites;
DROP TABLE IF EXISTS public.cash_flow;

-- Create accessory_purchases table
CREATE TABLE public.accessory_purchases (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    supplier VARCHAR(255) NOT NULL,
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unit_price NUMERIC(10,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL -- Corrected to public.users (BIGINT)
);

-- Create stock_notifications table
CREATE TABLE public.stock_notifications (
    id SERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES public.users(id) ON DELETE CASCADE, -- Corrected to public.users (BIGINT)
    email VARCHAR(255) NOT NULL,
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id BIGINT,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ
);

-- Create product_favorites table
CREATE TABLE public.product_favorites (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE, -- Corrected to public.users (BIGINT)
    product_id BIGINT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

-- Create cash_flow table
CREATE TABLE public.cash_flow (
    id SERIAL PRIMARY KEY,
    type VARCHAR(10) NOT NULL CHECK (type IN ('IN', 'OUT')),
    category VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT,
    order_id BIGINT REFERENCES public.orders(id) ON DELETE SET NULL,
    user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL, -- Corrected to public.users (BIGINT)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions
GRANT ALL ON public.accessory_purchases TO postgres, authenticated, service_role;
GRANT ALL ON public.stock_notifications TO postgres, authenticated, service_role;
GRANT ALL ON public.product_favorites TO postgres, authenticated, service_role;
GRANT ALL ON public.cash_flow TO postgres, authenticated, service_role;

-- Grant permissions on sequences dynamically
DO $$
DECLARE
    seq_name text;
BEGIN
    seq_name := pg_get_serial_sequence('public.accessory_purchases', 'id');
    IF seq_name IS NOT NULL THEN EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ' || seq_name || ' TO postgres, authenticated, service_role'; END IF;

    seq_name := pg_get_serial_sequence('public.stock_notifications', 'id');
    IF seq_name IS NOT NULL THEN EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ' || seq_name || ' TO postgres, authenticated, service_role'; END IF;

    seq_name := pg_get_serial_sequence('public.product_favorites', 'id');
    IF seq_name IS NOT NULL THEN EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ' || seq_name || ' TO postgres, authenticated, service_role'; END IF;

    seq_name := pg_get_serial_sequence('public.cash_flow', 'id');
    IF seq_name IS NOT NULL THEN EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE ' || seq_name || ' TO postgres, authenticated, service_role'; END IF;
END $$;
