/**
 * Monta um filtro `.or()` do PostgREST com `ilike` em várias colunas a
 * partir de um texto digitado pelo usuário.
 *
 * Interpolar o texto cru em `.or()` permite injetar filtros: vírgula e
 * parênteses são separadores da sintaxe do PostgREST (ex: buscar
 * `x%,is_used.eq.false` vira um segundo filtro). Por isso removemos os
 * caracteres reservados (`,()"\*`) e envolvemos o valor em aspas duplas,
 * que fazem o PostgREST tratar `.` e `:` como texto literal.
 *
 * Retorna `null` quando não sobra termo de busca — quem chama deve então
 * simplesmente não aplicar o `.or()`.
 */
export function buildIlikeOr(
  columns: string[],
  raw: string | null | undefined,
): string | null {
  const term = (raw ?? '')
    .replace(/[,()"\\*]/g, ' ')
    .trim()
    .slice(0, 100);

  if (!term) return null;

  return columns.map((col) => `${col}.ilike."%${term}%"`).join(',');
}
