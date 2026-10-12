/**
 * Limpa um termo digitado pelo usuário para uso dentro de `.or()` do
 * PostgREST.
 *
 * Interpolar o texto cru em `.or()` permite injetar filtros: vírgula e
 * parênteses são separadores da sintaxe do PostgREST (ex: buscar
 * `x%,is_used.eq.false` vira um segundo filtro). Por isso removemos os
 * caracteres reservados (`,()"\*`); quem monta o filtro ainda envolve o
 * valor em aspas duplas, que fazem o PostgREST tratar `.` e `:` como texto
 * literal. Também tira espaços das pontas ("7 " vira "7").
 */
export function sanitizeFilterTerm(raw: string | null | undefined): string {
  return (raw ?? '')
    .replace(/[,()"\\*]/g, ' ')
    .trim()
    .slice(0, 100);
}

/**
 * Monta um filtro `.or()` com `ilike` (contém) em várias colunas.
 *
 * Retorna `null` quando não sobra termo de busca — quem chama deve então
 * simplesmente não aplicar o `.or()`.
 */
export function buildIlikeOr(
  columns: string[],
  raw: string | null | undefined,
): string | null {
  const term = sanitizeFilterTerm(raw);

  if (!term) return null;

  return columns.map((col) => `${col}.ilike."%${term}%"`).join(',');
}

/**
 * Monta um filtro `.or()` de igualdade exata de código em várias colunas,
 * aceitando o termo como digitado, em MAIÚSCULAS e em minúsculas (códigos
 * do fornecedor são gravados em maiúsculas, mas a pessoa pode digitar
 * "ab12"). Usa `in` em vez de `ilike` sem `%` para que `_` e `%` dentro do
 * código não virem curinga.
 *
 * Ex: buildExactCodeOr(['sku', 'sku2'], ' ab12 ') →
 *   'sku.in.("ab12","AB12"),sku2.in.("ab12","AB12")'
 */
export function buildExactCodeOr(
  columns: string[],
  raw: string | null | undefined,
): string | null {
  const term = sanitizeFilterTerm(raw);
  if (!term) return null;

  const variants = [...new Set([term, term.toUpperCase(), term.toLowerCase()])];
  const list = variants.map((v) => `"${v}"`).join(',');

  return columns.map((col) => `${col}.in.(${list})`).join(',');
}
