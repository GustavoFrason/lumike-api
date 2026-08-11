/**
 * Helper de teste: mock encadeável do SupabaseClient.
 * --------------------------------------------------
 * Reproduz a API fluente do supabase-js (`.from().select().eq()...`): todo
 * método intermediário retorna o próprio mock (encadeável via
 * `mockReturnThis`), e os métodos terminais (`single`, `maybeSingle`, `rpc`)
 * são jest.fn() isolados — configure o retorno de cada um por teste com
 * `mockResolvedValueOnce({ data, error })`.
 *
 * Fica em `src/` (não em `test/`) porque o jest deste projeto usa
 * `rootDir: "src"` (ver package.json) — specs fora daí não são descobertos.
 *
 * Para uma chamada que é awaited sem terminal explícito (ex:
 * `await this.supabase.from('x').insert(y)`), sobrescreva o método usado
 * como terminal naquele teste, ex:
 *   mockSupabase.insert.mockResolvedValueOnce({ error: null });
 * em vez do `mockReturnThis()` padrão.
 *
 * Uso:
 *   const mockSupabase = createMockSupabaseClient();
 *   ...
 *   mockSupabase.single.mockResolvedValueOnce({ data: {...}, error: null });
 */
export type MockSupabaseClient = Record<string, jest.Mock>;

const CHAINABLE_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
  'or',
  'is',
  'order',
  'range',
  'limit',
];

export function createMockSupabaseClient(): MockSupabaseClient {
  const mock: MockSupabaseClient = {};

  mock.from = jest.fn().mockReturnValue(mock);
  mock.rpc = jest.fn();
  mock.single = jest.fn();
  mock.maybeSingle = jest.fn();

  for (const method of CHAINABLE_METHODS) {
    mock[method] = jest.fn().mockReturnValue(mock);
  }

  return mock;
}
