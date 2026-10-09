/**
 * O PostgREST devolve no máximo 1000 linhas por requisição (max_rows) —
 * relatórios que precisam de TODAS as linhas de um período paginam aqui.
 * `fetchPage(from, to)` deve aplicar `.range(from, to)` na consulta.
 */
export async function fetchAllPages<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);

    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}
