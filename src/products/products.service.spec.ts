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
