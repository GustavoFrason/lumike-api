import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import { CashFlowService } from './cash-flow.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('CashFlowService', () => {
  let service: CashFlowService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashFlowService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<CashFlowService>(CashFlowService);
  });

  describe('createEntry', () => {
    it('inserts the entry and returns success', async () => {
      mockSupabase.insert.mockResolvedValueOnce({ error: null });

      const result = await service.createEntry({
        type: 'IN',
        category: 'venda',
        amount: 100,
        order_id: 1,
      });

      expect(result).toEqual({ success: true });
      expect(mockSupabase.from).toHaveBeenCalledWith('cash_flow');
    });

    it('throws InternalServerErrorException when the insert fails', async () => {
      mockSupabase.insert.mockResolvedValueOnce({
        error: { message: 'db offline' },
      });

      await expect(
        service.createEntry({ type: 'OUT', category: 'ajuste', amount: 10 }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getBalance', () => {
    it('reads the aggregated balance from vw_cash_flow_balance', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { balance: 1234.5 },
        error: null,
      });

      const result = await service.getBalance();

      expect(mockSupabase.from).toHaveBeenCalledWith('vw_cash_flow_balance');
      expect(result).toEqual({ balance: 1234.5 });
    });

    it('defaults to zero when the view returns no row', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.getBalance();
      expect(result).toEqual({ balance: 0 });
    });
  });

  describe('getStats', () => {
    it('aggregates entries by category and fills the last N days', async () => {
      const today = new Date().toISOString();
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          { type: 'IN', category: 'venda', amount: 100, created_at: today },
          { type: 'OUT', category: 'compra', amount: 30, created_at: today },
        ],
        error: null,
      });

      const result = await service.getStats(30);

      expect(result.dailyStats).toHaveLength(30);
      expect(result.categoryStats).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'venda', type: 'IN' }),
          expect.objectContaining({ name: 'compra', type: 'OUT' }),
        ]),
      );
    });
  });
});
