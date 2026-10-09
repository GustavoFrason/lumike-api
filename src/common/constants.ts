/**
 * Data em que o fluxo de caixa (`cash_flow`) passou a ser a fonte da
 * receita. Antes disso o dashboard soma os pedidos antigos pela "ponte
 * legada" (ver DashboardService). Venda com data passada não pode cair
 * antes daqui, senão seria contada duas vezes.
 */
export const CASH_FLOW_START_DATE = '2026-01-10';
