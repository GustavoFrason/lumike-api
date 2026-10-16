-- Create table for Leads (Capture Popup)
create table if not exists public.leads (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text,
  whatsapp text,
  birthday text,
  coupon_code text,
  is_used boolean default false,
  created_at timestamPTZ default now()
);

-- Policy to allow inserting leads (public)
alter table public.leads enable row level security;

create policy "Enable insert for all users" 
on public.leads for insert 
with check (true);

create policy "Enable read for authenticated users only"
on public.leads for select
to authenticated
using (true);
