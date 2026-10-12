import { buildExactCodeOr, buildIlikeOr } from './postgrest-filter.util';

describe('buildExactCodeOr', () => {
  it('matches the code exactly in every column, in as-typed/upper/lower case', () => {
    expect(buildExactCodeOr(['sku', 'sku2'], ' ab12 ')).toBe(
      'sku.in.("ab12","AB12"),sku2.in.("ab12","AB12")',
    );
  });

  it('dedupes variants for numeric codes', () => {
    expect(buildExactCodeOr(['sku'], '7')).toBe('sku.in.("7")');
  });

  it('keeps _ and % literal (no wildcard) and strips separators', () => {
    expect(buildExactCodeOr(['sku2'], 'A_1%,X')).toBe(
      'sku2.in.("A_1% X","a_1% x")',
    );
  });

  it('returns null for empty input', () => {
    expect(buildExactCodeOr(['sku'], '   ')).toBeNull();
    expect(buildExactCodeOr(['sku'], undefined)).toBeNull();
  });
});

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
