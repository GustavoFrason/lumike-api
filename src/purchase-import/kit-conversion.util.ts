/**
 * Kits da Zarpellon: um kit é N peças IGUAIS vendidas soltas na loja.
 *
 * Na entrada da compra o kit é desmembrado — estoque em peças, custo e
 * preço por peça — para que cada peça tenha etiqueta e preço próprios. A
 * planilha traz quantidade de kits, custo do kit e (opcionalmente) o preço
 * de venda do kit inteiro; quem decide quantas peças vêm no kit é a pessoa
 * no preview (o sistema só sugere a partir da descrição).
 */

/** Prefixo que marca uma linha como kit/conjunto. */
const KIT_PREFIX = /^\s*(KIT|CONJUNTO|CJ)\b[\s.:-]*/i;
/** Conectivos depois do prefixo: "KIT C/ 12...", "KIT COM 6...", "KIT DE 3...". */
const CONNECTOR = /^(C\/|COM|DE)\s*/i;
/**
 * Contagem de peças logo depois do prefixo. O número NÃO pode ser medida:
 * "KIT 18K" (quilate), "KIT 10MM", "KIT 45 CM", "KIT 2G" não são contagem.
 */
const PIECE_COUNT = /^(\d{1,3})(?![\d.,])(?!\s*(?:K|MM|CM|G|ML|CT)\b)/i;
/** Unidade opcional depois da contagem: "12 PÇ", "6 PCS", "3 PEÇAS", "4 UN". */
const PIECE_UNIT = /^\s*(P[ÇC]S?\.?|PE[ÇC]AS?|UN(?:ID)?\.?|UNIDADES?)\b\s*/i;

export const MAX_PIECES_PER_KIT = 500;

/** A descrição começa com KIT/CONJUNTO/CJ? */
export function isKitDescription(name: string): boolean {
  return KIT_PREFIX.test(name);
}

/**
 * Sugere quantas peças vêm no kit a partir da descrição ("KIT 12 BRINCOS"
 * → 12). `null` quando não é kit ou quando não dá pra saber com segurança
 * — a pessoa ajusta no preview.
 */
export function suggestPiecesPerKit(name: string): number | null {
  if (!isKitDescription(name)) return null;

  const rest = name.replace(KIT_PREFIX, '').replace(CONNECTOR, '');
  const match = PIECE_COUNT.exec(rest);
  if (!match) return null;

  const pieces = Number(match[1]);
  return pieces >= 2 && pieces <= MAX_PIECES_PER_KIT ? pieces : null;
}

/**
 * Descrição sem o prefixo do kit e sem a contagem de peças — usada para
 * sugerir a categoria ("KIT 12 BRINCOS ARGOLA" → "BRINCOS ARGOLA").
 */
export function stripKitPrefix(name: string): string {
  if (!isKitDescription(name)) return name.trim();

  let rest = name.replace(KIT_PREFIX, '').replace(CONNECTOR, '');
  const count = PIECE_COUNT.exec(rest);
  if (count) {
    rest = rest.slice(count[0].length).replace(PIECE_UNIT, '');
    rest = rest.replace(/^\s*DE\s+/i, '');
  }
  return rest.trim();
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface PurchaseUnitValues {
  /** Quantidade comprada (em kits, quando for kit). */
  quantity: number;
  /** Custo por unidade comprada (custo do kit). */
  unit_cost: number;
  /** Preço de venda por unidade comprada (preço do kit), quando houver. */
  price?: number | null;
}

export interface PieceValues {
  /** Quantidade em PEÇAS (entra no estoque). */
  quantity: number;
  /** Custo por peça (arredondado em centavos). */
  unit_cost: number;
  /** Preço de venda por peça (arredondado em centavos), ou null. */
  price: number | null;
  /** Valor pago pela linha (exato): quantidade × custo do kit. */
  total_cost: number;
}

/**
 * Converte valores por unidade comprada (kit) em valores por peça. Com
 * `piecesPerKit = 1` (produto comum) os valores ficam iguais.
 */
export function toPieceValues(
  values: PurchaseUnitValues,
  piecesPerKit = 1,
): PieceValues {
  const pieces = Math.max(1, Math.floor(piecesPerKit));
  return {
    quantity: values.quantity * pieces,
    unit_cost: round2(values.unit_cost / pieces),
    price:
      values.price === undefined || values.price === null
        ? null
        : round2(values.price / pieces),
    total_cost: round2(values.quantity * values.unit_cost),
  };
}
