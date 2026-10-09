import {
  isKitDescription,
  stripKitPrefix,
  suggestPiecesPerKit,
  toPieceValues,
} from './kit-conversion.util';

describe('kit-conversion', () => {
  describe('suggestPiecesPerKit', () => {
    it.each([
      ['KIT 12 BRINCOS ARGOLA', 12],
      ['kit 6 anéis', 6],
      ['KIT C/ 3 PULSEIRAS', 3],
      ['KIT COM 10 PCS BRINCO', 10],
      ['CONJUNTO 4 COLARES', 4],
      ['KIT 2 PARES BRINCO', 2],
    ])('"%s" → %d', (name, expected) => {
      expect(suggestPiecesPerKit(name)).toBe(expected);
    });

    it.each([
      'KIT 18K BRINCO', // quilate
      'KIT 10MM ARGOLA', // medida
      'KIT 45 CM CORRENTE', // medida
      'KIT BRINCOS SORTIDOS', // sem número
      'KIT 1 BRINCO', // 1 peça não é kit desmembrável
      'BRINCO 12 PEDRAS', // não começa com KIT
    ])('"%s" → null (pessoa decide no preview)', (name) => {
      expect(suggestPiecesPerKit(name)).toBeNull();
    });
  });

  describe('stripKitPrefix', () => {
    it.each([
      ['KIT 12 BRINCOS ARGOLA', 'BRINCOS ARGOLA'],
      ['KIT C/ 6 PCS ANEL DOURADO', 'ANEL DOURADO'],
      ['KIT DE 3 PEÇAS DE PULSEIRA', 'PULSEIRA'],
      ['CONJUNTO COLAR E BRINCO', 'COLAR E BRINCO'],
      ['BRINCO ARGOLA', 'BRINCO ARGOLA'],
    ])('"%s" → "%s"', (name, expected) => {
      expect(stripKitPrefix(name)).toBe(expected);
    });
  });

  it('isKitDescription only matches the KIT/CONJUNTO/CJ word at the start', () => {
    expect(isKitDescription('KIT 12 BRINCOS')).toBe(true);
    expect(isKitDescription('CJ 3 ANEIS')).toBe(true);
    expect(isKitDescription('KITTY BRINCO')).toBe(false);
    expect(isKitDescription('BRINCO KIT')).toBe(false);
  });

  describe('toPieceValues', () => {
    it('splits a kit into pieces (stock, cost and price per piece)', () => {
      expect(
        toPieceValues({ quantity: 2, unit_cost: 60, price: 240 }, 12),
      ).toEqual({ quantity: 24, unit_cost: 5, price: 20, total_cost: 120 });
    });

    it('rounds cost per piece to cents but keeps the paid total exact', () => {
      expect(toPieceValues({ quantity: 1, unit_cost: 10 }, 3)).toEqual({
        quantity: 3,
        unit_cost: 3.33,
        price: null,
        total_cost: 10,
      });
    });

    it('leaves regular products unchanged (1 piece per unit)', () => {
      expect(
        toPieceValues({ quantity: 5, unit_cost: 8.5, price: 25.5 }),
      ).toEqual({ quantity: 5, unit_cost: 8.5, price: 25.5, total_cost: 42.5 });
    });
  });
});
