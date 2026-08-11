# Como regenerar `src/types/supabase.ts`

`lumike-api/src/types/supabase.ts` e `lumike-ui/src/types/supabase.ts` devem
ser **o mesmo arquivo** (copie um para o outro depois de regenerar).

## Forma oficial (preferida)

Precisa da Supabase CLI logada (`npx supabase login`):

```bash
npx supabase gen types typescript --project-id mzejzrtgolwkjhqxtdcr --schema public > src/types/supabase.ts
```

O `project-id` é o ref na URL do projeto no dashboard, ou o subdomínio da
`SUPABASE_URL` (`https://<ref>.supabase.co`).

**Atenção Windows/PowerShell:** `>` no PowerShell grava em UTF-16 por
padrão, o que quebra o TypeScript. Se isso acontecer, o arquivo aparece
ilegível/corrompido — converta com:

```powershell
Get-Content src/types/supabase.ts -Encoding Unicode | Set-Content src/types/supabase.ts -Encoding UTF8
```

## Alternativa: introspecção direta via PostgREST (sem CLI/token de conta)

Usada em 06/08/2026 porque não havia CLI logada disponível no ambiente que
gerou a versão atual. Funciona com a `SUPABASE_SERVICE_ROLE` que já está no
`.env` (é a mesma fonte de dados que a CLI usa por baixo dos panos — o
endpoint OpenAPI do PostgREST):

```bash
curl -s -H "apikey: $SUPABASE_SERVICE_ROLE" \
     -H "Accept: application/openapi+json" \
     "$SUPABASE_URL/rest/v1/" > openapi.json
```

Isso devolve um Swagger 2.0 com um `definitions.<tabela>` por tabela/view,
incluindo `required` (colunas NOT NULL) e `default`. **Atenção:** colunas
`BIGINT GENERATED ALWAYS AS IDENTITY` (todo PK deste schema) não aparecem
com `default` nesse dump — o PostgreREST não expõe metadado de identity
como default, só como "required". Trate qualquer PK `integer`/`bigint`
como implicitamente opcional no `Insert` mesmo sem `default` explícito, ou
o tipo gerado vai exigir passar `id` manualmente em todo insert.

Também é preciso adicionar manualmente em cada tabela/view um campo
`Relationships: GenericRelationship[]` — sem ele, `@supabase/supabase-js`
(≥2.7x) infere `never` pro schema inteiro. As notas de FK vêm na
`description` de cada coluna: `<fk table='X' column='Y'/>`.

## Depois de aplicar uma migration nova

Reaplique o passo acima — os comentários `PENDENTE:` que aparecem hoje no
arquivo (view `vw_cash_flow_balance`, funções
`fn_adjust_stock`/`fn_create_order`/`fn_cancel_order`/`fn_transfer_stock`,
e `warranties.customer_id` nullable) foram adicionados manualmente porque
as migrations correspondentes ainda não tinham sido aplicadas no banco no
momento da geração — a regeneração de verdade vai trazer isso automaticamente
e esses comentários somem.
