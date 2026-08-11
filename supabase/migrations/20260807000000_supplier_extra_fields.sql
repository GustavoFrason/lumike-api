-- O front de fornecedores (SupplierModal.tsx) sempre teve campos que o
-- backend nunca implementou: contact_name, document (CNPJ/CPF, o front usa
-- esse nome, não "cnpj"), address, category. Com o ValidationPipe global em
-- forbidNonWhitelisted, qualquer POST /suppliers do front real sempre deu
-- 400 (achado testando "Novo Fornecedor" contra o Supabase local).
--
-- cnpj -> document: nenhum outro lugar do backend referencia a coluna cnpj
-- (só o DTO e os tipos gerados), e o front inteiro (form, listagem,
-- casamento de fornecedor por CNPJ na importação de XML) já usa "document".
ALTER TABLE suppliers RENAME COLUMN cnpj TO document;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;
