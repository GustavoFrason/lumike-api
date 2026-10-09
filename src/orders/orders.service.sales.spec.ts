/**
 * Regras de venda da loja x revendedora, venda com data passada, filtros,
 * escopo da revendedora e resumo por vendedora (Fase C).
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { SettingsService } from '../settings/settings.service';
import { CreateOrderDto } from './dto/create-order.dto';
import type { AuthUser } from '../auth/types/auth-user.type';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

const admin: AuthUser = { sub: 1, email: 'a@x.com', role: 'admin', role_id: 1 };
const reseller: AuthUser = {
  sub: 42,
  email: 'rev@x.com',
  role: 'vendedor',
  role_id: 3,
};

describe('OrdersService — vendas da loja e das revendedoras', () => {
  let service: OrdersService;
  let mockSupabase: MockSupabaseClient;

  const baseDto: CreateOrderDto = {
    payment_method: 'dinheiro',
    payment_status: 'pago',
    items: [{ product_id: 1, quantity: 2, unit_price: 50 }],
  };

  /** Args da chamada a fn_create_order. */
  const rpcArgs = () =>
    (mockSupabase.rpc.mock.calls[0] as unknown[])[1] as Record<string, unknown>;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    // 15h UTC = 12h em São Paulo, dia 09/10/2026
    jest.setSystemTime(new Date('2026-10-09T15:00:00Z'));

    mockSupabase = createMockSupabaseClient();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
        {
          provide: SettingsService,
          useValue: { getNumber: jest.fn().mockResolvedValue(0.1) },
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    mockSupabase.rpc.mockResolvedValue({ data: 99, error: null });
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue({ id: 99 } as Awaited<
        ReturnType<OrdersService['findOne']>
      >);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('revendedora (papel vendedor)', () => {
    it('vende sempre como ela mesma e da própria mala, ignorando o que o front mandar', async () => {
      await service.create(
        { ...baseDto, seller_id: 7, stock_location_user_id: undefined },
        reseller,
      );

      expect(rpcArgs()).toMatchObject({
        p_seller_id: 42,
        p_stock_location_user_id: 42,
        // dinheiro fica com ela: entra no caixa só no acerto
        p_record_cash: false,
      });
    });

    it('não pode lançar venda com data passada', async () => {
      await expect(
        service.create({ ...baseDto, sale_date: '2026-10-01' }, reseller),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it.each([
      [{ payment_method: 'boca', payment_status: 'aberto' }],
      [{ payment_method: 'dinheiro', payment_status: 'parcial' }],
    ])('não pode lançar venda fiado (%o)', async (payment) => {
      await expect(
        service.create({ ...baseDto, ...payment }, reseller),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('gestão', () => {
    it('venda do estoque central entra no caixa normalmente', async () => {
      await service.create(baseDto, admin);

      expect(rpcArgs()).toMatchObject({
        p_stock_location_user_id: null,
        p_record_cash: true,
        p_sale_date: null,
      });
    });

    it('venda registrada pela gestão mas saindo da mala da revendedora não entra no caixa', async () => {
      await service.create(
        { ...baseDto, seller_id: 42, stock_location_user_id: 42 },
        admin,
      );

      expect(rpcArgs()).toMatchObject({
        p_seller_id: 42,
        p_stock_location_user_id: 42,
        p_record_cash: false,
      });
    });

    it('lança venda com data passada ao meio-dia de São Paulo', async () => {
      await service.create({ ...baseDto, sale_date: '2026-10-01' }, admin);

      expect(rpcArgs().p_sale_date).toBe('2026-10-01T12:00:00-03:00');
    });

    it('data de hoje é tratada como "agora"', async () => {
      await service.create({ ...baseDto, sale_date: '2026-10-09' }, admin);

      expect(rpcArgs().p_sale_date).toBeNull();
    });

    it('recusa data futura e anterior ao início do fluxo de caixa', async () => {
      await expect(
        service.create({ ...baseDto, sale_date: '2026-10-10' }, admin),
      ).rejects.toThrow(/futura/);
      await expect(
        service.create({ ...baseDto, sale_date: '2025-12-31' }, admin),
      ).rejects.toThrow(/anterior/);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      mockSupabase.range.mockResolvedValue({ data: [], error: null, count: 0 });
    });

    it('aplica filtros de vendedora, estoque de origem e período (dias de São Paulo)', async () => {
      await service.findAll(
        {
          seller_id: '42',
          stock_location: 'central',
          date_from: '2026-10-01',
          date_to: '2026-10-31',
        },
        admin,
      );

      expect(mockSupabase.eq).toHaveBeenCalledWith('seller_id', 42);
      expect(mockSupabase.is).toHaveBeenCalledWith(
        'stock_location_user_id',
        null,
      );
      expect(mockSupabase.gte).toHaveBeenCalledWith(
        'created_at',
        '2026-10-01T00:00:00-03:00',
      );
      expect(mockSupabase.lt).toHaveBeenCalledWith(
        'created_at',
        '2026-11-01T00:00:00-03:00',
      );
      expect(mockSupabase.or).not.toHaveBeenCalled();
    });

    it("seller_id 'none' filtra vendas sem vendedora (loja)", async () => {
      await service.findAll({ seller_id: 'none' }, admin);

      expect(mockSupabase.is).toHaveBeenCalledWith('seller_id', null);
    });

    it('revendedora só recebe as próprias vendas', async () => {
      await service.findAll({}, reseller);

      expect(mockSupabase.or).toHaveBeenCalledWith(
        'seller_id.eq.42,stock_location_user_id.eq.42',
      );
    });
  });

  describe('findOne (escopo da revendedora)', () => {
    beforeEach(() => {
      (service.findOne as jest.Mock).mockRestore();
    });

    const mockOrder = (order: Record<string, unknown>) => {
      mockSupabase.eq
        .mockReturnValueOnce(mockSupabase) // pedido: segue até .single()
        .mockResolvedValueOnce({ data: [], error: null }); // itens
      mockSupabase.single.mockResolvedValueOnce({ data: order, error: null });
    };

    it('abre a venda que é dela', async () => {
      mockOrder({ id: 5, seller_id: 42, stock_location_user_id: 42 });

      await expect(service.findOne(5, reseller)).resolves.toMatchObject({
        id: 5,
      });
    });

    it('venda de outra pessoa vira 404 para a revendedora', async () => {
      mockOrder({ id: 6, seller_id: 7, stock_location_user_id: null });

      await expect(service.findOne(6, reseller)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('summary', () => {
    it('soma por vendedora (com comissão) e agrupa o resto como Loja', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            total_amount: 100,
            seller_id: 42,
            stock_location_user_id: 42,
          },
          {
            id: 2,
            total_amount: 50,
            seller_id: 42,
            stock_location_user_id: null,
          },
          {
            id: 3,
            total_amount: 80,
            seller_id: null,
            stock_location_user_id: null,
          },
          {
            id: 4,
            total_amount: 20,
            seller_id: 1,
            stock_location_user_id: null,
          }, // admin
        ],
        error: null,
      });
      mockSupabase.in.mockResolvedValueOnce({
        data: [
          {
            id: 42,
            name: 'Ana',
            commission_rate: 20,
            roles: { name: 'vendedor' },
          },
          { id: 1, name: 'Dono', commission_rate: 0, roles: { name: 'admin' } },
        ],
        error: null,
      });

      const result = await service.summary({}, admin);

      expect(mockSupabase.neq).toHaveBeenCalledWith('status', 'cancelled');
      expect(result.by_seller).toEqual([
        {
          seller_id: 42,
          name: 'Ana',
          orders_count: 2,
          total: 150,
          commission_rate: 20,
          commission: 30,
        },
        {
          seller_id: null,
          name: 'Loja',
          orders_count: 2,
          total: 100,
          commission_rate: 0,
          commission: 0,
        },
      ]);
      expect(result.by_stock_location).toEqual([
        { user_id: null, name: 'Estoque Central', orders_count: 3, total: 150 },
        { user_id: 42, name: 'Ana', orders_count: 1, total: 100 },
      ]);
      expect(result.totals).toEqual({
        orders_count: 4,
        total: 250,
        commission: 30,
      });
    });
  });

  describe('cancelamento de venda da mala da revendedora', () => {
    it('recusa estorno quando o dinheiro nunca entrou no caixa da loja', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 9, stock_location_user_id: 42 },
        error: null,
      });
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });

      await expect(
        service.cancelOrder(9, { refundAmount: 30, notes: '' }),
      ).rejects.toThrow(/revendedora/);
      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });

    it('aceita estorno de venda antiga da mala que já tinha entrado no caixa', async () => {
      mockSupabase.maybeSingle.mockResolvedValueOnce({
        data: { id: 9, stock_location_user_id: 42 },
        error: null,
      });
      mockSupabase.limit.mockResolvedValueOnce({
        data: [{ id: 1 }],
        error: null,
      });
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      await expect(
        service.cancelOrder(9, { refundAmount: 30, notes: '' }),
      ).resolves.toEqual({ success: true });
    });

    it('cancelar sem estorno não consulta nada além da função', async () => {
      mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: null });

      await service.cancelOrder(9, { refundAmount: 0, notes: '' });

      expect(mockSupabase.maybeSingle).not.toHaveBeenCalled();
    });
  });
});
