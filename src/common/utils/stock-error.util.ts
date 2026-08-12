const INSUFFICIENT_STOCK_MARKER = 'INSUFFICIENT_STOCK:';

/**
 * `fn_adjust_stock` (Postgres) já formata a mensagem de estoque
 * insuficiente pronta pra exibir na tela (nome do produto + disponível +
 * solicitado — ver migration 20260811000005), atrás de um marcador fixo
 * (`INSUFFICIENT_STOCK:`) usado só pra identificar esse erro de negócio
 * específico em meio a qualquer outro erro de banco. Quem chama já checou
 * `.includes('INSUFFICIENT_STOCK')`; isso aqui só separa o texto pronto do
 * marcador.
 */
export function extractInsufficientStockMessage(rawMessage: string): string {
  const detail = rawMessage.split(INSUFFICIENT_STOCK_MARKER)[1]?.trim();
  return detail || 'Estoque insuficiente para um ou mais itens.';
}
