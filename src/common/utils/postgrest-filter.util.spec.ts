import { buildIlikeOr } from './postgrest-filter.util';

describe('buildIlikeOr', () => {
  it('builds a quoted ilike filter for every column', () => {
    expect(buildIlikeOr(['name', 'sku'], 'anel')).toBe(
      'name.ilike."%anel%",sku.ilike."%anel%"',
    );
  });

  it('strips PostgREST separators so the term cannot inject extra filters', () => {
    const filter = buildIlikeOr(['name'], 'x%,is_active.eq.false');
    expect(filter).toBe('name.ilike."%x% is_active.eq.false%"');
    expect(filter?.split(',')).toHaveLength(1);
  });

  it('removes quotes, backslashes, parentheses and asterisks', () => {
    expect(buildIlikeOr(['name'], 'a"b\\c(d)e*f')).toBe(
      'name.ilike."%a b c d e f%"',
    );
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(buildIlikeOr(['name'], '')).toBeNull();
    expect(buildIlikeOr(['name'], '   ')).toBeNull();
    expect(buildIlikeOr(['name'], undefined)).toBeNull();
    expect(buildIlikeOr(['name'], ',,()')).toBeNull();
  });

  it('caps the term length at 100 characters', () => {
    const filter = buildIlikeOr(['name'], 'a'.repeat(500));
    expect(filter).toBe(`name.ilike."%${'a'.repeat(100)}%"`);
  });
});
