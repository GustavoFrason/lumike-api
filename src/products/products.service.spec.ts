import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('ProductsService', () => {
  let service: ProductsService;
  let mockSupabase: MockSupabaseClient;

  /** Primeiro argumento passado ao `.select()` (a lista de colunas). */
  const firstSelectArg = () =>
    (mockSupabase.select.mock.calls[0] as unknown[])[0] as string;

  beforeEach(async () => {
    jest.setTimeout(10000); // Increase timeout
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: 'SUPABASE_CLIENT',
          useValue: mockSupabase,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateProductDto = {
      name: 'Test Product',
      sku2: 'FORNECEDOR-SKU',
      short_description: 'Test Product',
      price: 100,
      purchase_date: '2026-01-01',
      current_stock: 10,
    };

    it('creates the product without checking sku duplicity (sku vira o id via trigger)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 2, ...createDto },
        error: null,
      });

      const result = await service.create(createDto);

      expect(result.id).toBe(2);
      expect(mockSupabase.insert).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated products', async () => {
      const mockData = [
        { id: 1, name: 'P1' },
        { id: 2, name: 'P2' },
      ];

      // findAll não termina em .single()/.maybeSingle() — o próprio builder
      // é aguardado direto, então o terminal aqui é o último método
      // encadeado antes do await (range), não um dos terminais padrão do
      // helper (ver doc do createMockSupabaseClient).
      mockSupabase.range.mockResolvedValueOnce({
        data: mockData,
        error: null,
        count: 2,
      });

      const result = await service.findAll(1, 10);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
    });

    describe('publicView (visitante/cliente)', () => {
      beforeEach(() => {
        mockSupabase.range.mockResolvedValueOnce({
          data: [],
          error: null,
          count: 0,
        });
      });

      it('never selects internal columns like cost_price, sku2 or supplier_id', async () => {
        await service.findAll(
          1,
          10,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
        );

        const selectArg = firstSelectArg();
        expect(selectArg).not.toMatch(/cost_price|sku2|supplier_id|\*/);
        expect(selectArg).toMatch(/price/);
      });

      it('forces is_active=true even when the caller asks for inactive products', async () => {
        await service.findAll(
          1,
          10,
          false,
          undefined,
          undefined,
          undefined,
          true,
        );

        expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', true);
        expect(mockSupabase.eq).not.toHaveBeenCalledWith('is_active', false);
      });

      it('caps the page size at 100', async () => {
        const result = await service.findAll(
          1,
          100000,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
        );

        expect(mockSupabase.range).toHaveBeenCalledWith(0, 99);
        expect(result.pagination.limit).toBe(100);
      });

      it('does not search by supplier sku and quotes the term', async () => {
        await service.findAll(
          1,
          10,
          undefined,
          'a,id.gt.0',
          undefined,
          undefined,
          true,
        );

        expect(mockSupabase.or).toHaveBeenCalledWith(
          'name.ilike."%a id.gt.0%",sku.ilike."%a id.gt.0%"',
        );
      });
    });

    it('staff view keeps all columns and honors is_active=false', async () => {
      mockSupabase.range.mockResolvedValueOnce({
        data: [],
        error: null,
        count: 0,
      });

      await service.findAll(1, 10, false);

      const selectArg = firstSelectArg();
      expect(selectArg).toMatch(/^\*/);
      expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', false);
    });
  });

  describe('findBySlug', () => {
    it('public view filters inactive products and hides internal columns', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 1, name: 'Anel' },
        error: null,
      });

      await service.findBySlug('anel', true);

      expect(mockSupabase.eq).toHaveBeenCalledWith('slug', 'anel');
      expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', true);
      const selectArg = firstSelectArg();
      expect(selectArg).not.toMatch(/cost_price/);
    });

    it('staff view does not filter by is_active', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 1, name: 'Anel' },
        error: null,
      });

      await service.findBySlug('anel');

      expect(mockSupabase.eq).not.toHaveBeenCalledWith('is_active', true);
    });
  });

  describe('findOne', () => {
    it('should return a product if found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 1, name: 'Test' },
        error: null,
      });

      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException if not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });
});
