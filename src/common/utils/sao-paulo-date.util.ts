/**
 * Datas "do calendário da loja" (America/Sao_Paulo). O Brasil não tem mais
 * horário de verão, então o fuso é fixo em -03:00.
 */
const SAO_PAULO_TZ = 'America/Sao_Paulo';
const SAO_PAULO_OFFSET = '-03:00';

/** Hoje em São Paulo, 'YYYY-MM-DD' (independe do fuso do servidor). */
export function todayInSaoPaulo(now: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO_TZ }).format(
    now,
  );
}

/**
 * 'YYYY-MM-DD' → instante ao MEIO-DIA em São Paulo. Meio-dia porque meia-
 * noite em -03:00 já é o dia seguinte... ou o anterior, conforme quem lê
 * em UTC — no meio do dia nenhuma conversão vira a data.
 */
export function saoPauloNoon(date: string): string {
  return `${date}T12:00:00${SAO_PAULO_OFFSET}`;
}

/** Soma `days` a uma data 'YYYY-MM-DD'. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Filtro de período por dias do calendário de São Paulo: do início do dia
 * `from` até o início do dia seguinte a `to` (exclusivo).
 */
export function saoPauloRange(
  from?: string,
  to?: string,
): { gte?: string; lt?: string } {
  return {
    gte: from ? `${from}T00:00:00${SAO_PAULO_OFFSET}` : undefined,
    lt: to ? `${addDays(to, 1)}T00:00:00${SAO_PAULO_OFFSET}` : undefined,
  };
}
