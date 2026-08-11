import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SettingsService } from '../settings/settings.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('OrdersService', () => {
  let service: OrdersService;
  let mockSupabase: MockSupabaseClient;
  let mockSettingsService: Partial<SettingsService>;

  const baseDto = {
    payment_method: 'dinheiro',
    payment_status: 'pago',
    items: [{ product_id: 1, quantity: 2, unit_price: 50 }],
  };

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();
    mockSettingsService = { getNumber: jest.fn().mockResolvedValue(0.1) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  describe('create', () => {
    it('rejects an unknown or already-used coupon before touching the database', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      await expect(
        service.create({ ...baseDto, couponCode: 'INVALIDO' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('calls fn_create_order with the computed total and status, then returns the hydrated order', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: 42, error: null });
      // findOne(42) chama duas queries: a 1ª termina em .single() (pedido),
      // a 2ª termina no próprio .eq() (itens) — sem couponCode, .eq() só é
      // chamado dentro de findOne, então a ordem das duas chamadas é esta.
      mockSupabase.eq
        .mockReturnValueOnce(mockSupabase) // 1ª chamada: segue encadeando até .single()
        .mockResolvedValueOnce({
          data: [{ id: 1, product_id: 1 }],
          error: null,
        }); // 2ª: terminal
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 42, status: 'completed', total_amount: 100 },
        error: null,
      });

      const result = await service.create(baseDto as any, {
        sub: 9,
        email: 'vendedor@lumike.com',
        role: 'vendedor',
        role_id: 3,
      });

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'fn_create_order',
        expect.objectContaining({
          p_status: 'completed', // payment_status 'pago' => completed
          p_total_amount: 100, // 2 * 50, sem cupom
          p_paid_now: 100,
          p_cash_user_id: 9,
        }),
      );
      expect(result.id).toBe(42);
    });

    it('maps INSUFFICIENT_STOCK from fn_create_order into BadRequestException', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'INSUFFICIENT_STOCK: sem saldo' },
      });

      await expect(service.create(baseDto as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancelOrder', () => {
    it('returns success on the atomic cancel path', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      const result = await service.cancelOrder(1, {
        refundAmount: 50,
        notes: 'cliente desistiu',
      });

      expect(result).toEqual({ success: true });
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'fn_cancel_order',
        expect.objectContaining({ p_order_id: 1, p_refund_amount: 50 }),
      );
    });

    it('maps "não encontrado" into NotFoundException', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Pedido 999 não encontrado' },
      });

      await expect(
        service.cancelOrder(999, { refundAmount: 0, notes: '' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('maps "já está cancelado" into BadRequestException', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Pedido já está cancelado' },
      });

      await expect(
        service.cancelOrder(1, { refundAmount: 0, notes: '' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
