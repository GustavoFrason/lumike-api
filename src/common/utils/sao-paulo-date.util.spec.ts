import {
  addDays,
  saoPauloNoon,
  saoPauloRange,
  todayInSaoPaulo,
} from './sao-paulo-date.util';
import { fetchAllPages } from './fetch-all-pages.util';

describe('sao-paulo-date', () => {
  it('todayInSaoPaulo uses the store calendar, not UTC', () => {
    // 02:00 UTC do dia 10 = 23:00 do dia 9 em São Paulo
    expect(todayInSaoPaulo(new Date('2026-10-10T02:00:00Z'))).toBe(
      '2026-10-09',
    );
    expect(todayInSaoPaulo(new Date('2026-10-10T15:00:00Z'))).toBe(
      '2026-10-10',
    );
  });

  it('saoPauloNoon builds a timestamp that stays on the same day in UTC', () => {
    expect(saoPauloNoon('2026-09-30')).toBe('2026-09-30T12:00:00-03:00');
    expect(new Date(saoPauloNoon('2026-09-30')).toISOString()).toMatch(
      /^2026-09-30/,
    );
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('saoPauloRange covers whole days (end is exclusive, next day)', () => {
    expect(saoPauloRange('2026-10-01', '2026-10-31')).toEqual({
      gte: '2026-10-01T00:00:00-03:00',
      lt: '2026-11-01T00:00:00-03:00',
    });
    expect(saoPauloRange()).toEqual({ gte: undefined, lt: undefined });
  });
});

describe('fetchAllPages', () => {
  it('keeps requesting pages of 1000 until a short page', async () => {
    const pages = [
      Array.from({ length: 1000 }, (_, i) => i),
      Array.from({ length: 1000 }, (_, i) => 1000 + i),
      [2000, 2001],
    ];
    const fetchPage = jest.fn((from: number) =>
      Promise.resolve({ data: pages[from / 1000], error: null }),
    );

    const rows = await fetchAllPages(fetchPage);

    expect(rows).toHaveLength(2002);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('throws on database error', async () => {
    await expect(
      fetchAllPages(() =>
        Promise.resolve({ data: null, error: { message: 'boom' } }),
      ),
    ).rejects.toThrow('boom');
  });
});
