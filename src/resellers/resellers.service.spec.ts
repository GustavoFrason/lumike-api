import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ResellersService,
  StatementOrder,
  computeStatementTotals,
} from './resellers.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

const order = (overrides: Partial<StatementOrder>): StatementOrder => ({
  id: 1,
  created_at: '2026-10-01T12:00:00Z',
  customer_name: null,
  total: 0,
  pieces: 1,
  from_her_stock: true,
  is_her_sale: true,
  ...overrides,
});

describe('computeStatementTotals', () => {
  it('recebido = vendas da mala; comissão = taxa × vendas dela; a repassar = diferença', () => {
    const totals = computeStatementTotals(
      [
        order({ id: 1, total: 100, from_her_stock: true, is_her_sale: true }),
        order({ id: 2, total: 50, from_her_stock: true, is_her_sale: true }),
        // vendida por ela, mas do estoque da loja: comissão sem recebido
        order({ id: 3, total: 80, from_her_stock: false, is_her_sale: true }),
      ],
      20,
    );

    expect(totals).toEqual({
      orders_count: 3,
      pieces: 3,
      collected: 150,
      commission_base: 230,
      commission: 46,
      amount_due: 104,
    });
  });

  it('a repassar fica negativo quando a loja deve a ela', () => {
    const totals = computeStatementTotals(
      [order({ total: 100, from_her_stock: false, is_her_sale: true })],
      20,
    );
    expect(totals.amount_due).toBe(-20);
  });
});

describe('ResellersService', () => {
  let service: ResellersService;
  let mockSupabase: MockSupabaseClient;

  const reseller = {
    id: 42,
    name: 'Ana',
    is_active: true,
    commission_rate: 20,
    roles: { name: 'vendedor' },
  };

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResellersService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();
    service = module.get<ResellersService>(ResellersService);
  });

  describe('getStatement', () => {
    it('monta o extrato só com vendas não acertadas, saldo anterior, transferências e estoque', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: reseller,
        error: null,
      });
      // vendas candidatas (fetchAllPages termina em .range)
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          {
            id: 10,
            created_at: '2026-10-02T15:00:00Z',
            total_amount: 100,
            seller_id: 42,
            stock_location_user_id: 42,
            customers: { name: 'Bia' },
            order_items: [{ quantity: 2 }],
          },
          {
            id: 11,
            created_at: '2026-10-03T15:00:00Z',
            total_amount: 60,
            seller_id: 42,
            stock_location_user_id: 42,
            customers: null,
            order_items: [{ quantity: 1 }],
          },
        ],
        error: null,
      });
      // .in: venda 11 já acertada; demais .in seguem encadeando
      mockSupabase.in.mockImplementation((column: string) =>
        column === 'order_id'
          ? Promise.resolve({ data: [{ order_id: 11 }], error: null })
          : mockSupabase,
      );
      // acertos anteriores (terminal .order)
      mockSupabase.order.mockImplementation((column: string) =>
        column === 'created_at'
          ? Promise.resolve({
              data: [
                {
                  id: 3,
                  amount_due: 50,
                  amount_paid: 30,
                  period_end: '2026-09-30',
                  created_at: '2026-10-01T10:00:00Z',
                  reseller_user_id: 42,
                },
              ],
              error: null,
            })
          : mockSupabase,
      );
      // 1º .lt = vendas (segue encadeando até .range);
      // 2º .lt = transferências no período (terminal)
      mockSupabase.lt.mockReturnValueOnce(mockSupabase).mockResolvedValueOnce({
        data: [
          {
            quantity: 5,
            to_user_id: 42,
            from_user_id: null,
            products: { price: 10 },
          },
          {
            quantity: 1,
            to_user_id: null,
            from_user_id: 42,
            products: { price: 10 },
          },
        ],
        error: null,
      });
      // estoque atual (terminal .gt)
      mockSupabase.gt.mockResolvedValueOnce({
        data: [
          {
            product_id: 7,
            user_id: 42,
            quantity: 3,
            products: { name: 'Anel', sku: '7', price: 25 },
          },
        ],
        error: null,
      });

      const statement = await service.getStatement(
        42,
        '2026-10-01',
        '2026-10-31',
      );

      expect(statement.orders.map((o) => o.id)).toEqual([10]);
      expect(statement.totals).toMatchObject({
        collected: 100,
        commission: 20,
        amount_due: 80,
        pieces: 2,
      });
      expect(statement.previous_balance).toBe(20);
      expect(statement.balance_to_pay).toBe(100);
      expect(statement.transfers).toEqual({
        sent_pieces: 5,
        sent_value: 50,
        returned_pieces: 1,
        returned_value: 10,
      });
      expect(statement.current_stock).toMatchObject({ pieces: 3, value: 75 });
      expect(statement.last_settlement).toMatchObject({ id: 3 });
      // vendas até o fim do período (dia seguinte, exclusivo)
      expect(mockSupabase.lt).toHaveBeenCalledWith(
        'created_at',
        '2026-11-01T00:00:00-03:00',
      );
    });

    it('404 quando o usuário não é revendedora', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { ...reseller, roles: { name: 'gestor' } },
        error: null,
      });

      await expect(service.getStatement(42)).rejects.toThrow(NotFoundException);
    });
  });

  describe('createSettlement', () => {
    const dto = {
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      order_ids: [10, 10, 12],
      amount_paid: 80,
      expected_amount_due: 80,
      payment_method: 'pix',
    };

    beforeEach(() => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: reseller,
        error: null,
      });
    });

    it('chama a função atômica com as vendas (sem repetir) e quem registrou', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: 7, error: null });

      const result = await service.createSettlement(42, dto, {
        sub: 1,
        email: 'a@x.com',
        role: 'admin',
        role_id: 1,
      });

      expect(result).toEqual({ id: 7 });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'fn_create_reseller_settlement',
        expect.objectContaining({
          p_reseller: 42,
          p_order_ids: [10, 12],
          p_amount_paid: 80,
          p_expected_amount_due: 80,
          p_created_by: 1,
        }),
      );
    });

    it.each([
      [{ message: 'STALE_STATEMENT: valor a repassar mudou' }],
      [{ message: 'duplicate key', code: '23505' }],
    ])(
      'extrato desatualizado ou venda já acertada vira 409 (%o)',
      async (error) => {
        mockSupabase.rpc.mockResolvedValueOnce({ data: null, error });

        await expect(service.createSettlement(42, dto)).rejects.toThrow(
          ConflictException,
        );
      },
    );
  });
});
