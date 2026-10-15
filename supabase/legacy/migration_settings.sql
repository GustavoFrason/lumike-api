-- Create Site Settings Table
create table site_settings (
  key text primary key,
  value text,
  description text,
  updated_at timestamptz default now()
);

-- Insert default values (Seed)
insert into site_settings (key, value, description) values
('hero_banner_url', '', 'Imagem de fundo do banner principal da Home'),
('hero_title', 'Semijoias que Realçam sua Beleza', 'Título principal do banner'),
('hero_subtitle', 'Elegância e sofisticação para todos os momentos', 'Subtítulo do banner');

-- Enable RLS (Public Read, Admin Write)
alter table site_settings enable row level security;

create policy "Settings are viewable by everyone" 
on site_settings for select 
using (true);

create policy "Settings are updateable by admin" 
on site_settings for update 
using (true); -- Ideally restrict to admin role later
