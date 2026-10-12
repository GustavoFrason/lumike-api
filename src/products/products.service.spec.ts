import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkStatusDto } from './dto/bulk-status.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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

      const result = await service.findAll({ page: 1, limit: 10 });

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
        await service.findAll({ page: 1, limit: 10, publicView: true });

        const selectArg = firstSelectArg();
        expect(selectArg).not.toMatch(
          /cost_price|sku2|supplier_id|label_text|\*/,
        );
        expect(selectArg).toMatch(/price/);
      });

      it('forces is_active=true even when the caller asks for inactive products', async () => {
        await service.findAll({ isActive: false, publicView: true });

        expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', true);
        expect(mockSupabase.eq).not.toHaveBeenCalledWith('is_active', false);
      });

      it('caps the page size at 100', async () => {
        const result = await service.findAll({
          limit: 100000,
          publicView: true,
        });

        expect(mockSupabase.range).toHaveBeenCalledWith(0, 99);
        expect(result.pagination.limit).toBe(100);
      });

      it('does not search by supplier codes, quotes the term and skips the exact query', async () => {
        await service.findAll({ search: 'a,id.gt.0', publicView: true });

        expect(mockSupabase.or).toHaveBeenCalledTimes(1);
        expect(mockSupabase.or).toHaveBeenCalledWith(
          'name.ilike."%a id.gt.0%",sku.ilike."%a id.gt.0%"',
        );
      });

      it('always lists newest first, ignoring sort=code', async () => {
        await service.findAll({ publicView: true, sort: 'code' });

        expect(mockSupabase.order).toHaveBeenCalledWith('created_at', {
          ascending: false,
        });
        expect(mockSupabase.order).not.toHaveBeenCalledWith(
          'sku_sort',
          expect.anything(),
        );
      });
    });

    describe('staff view', () => {
      const emptyPage = () =>
        mockSupabase.range.mockResolvedValueOnce({
          data: [],
          error: null,
          count: 0,
        });

      it('keeps all columns and honors is_active=false', async () => {
        emptyPage();

        await service.findAll({ page: 1, limit: 10, isActive: false });

        const selectArg = firstSelectArg();
        expect(selectArg).toMatch(/^\*/);
        expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', false);
      });

      it('sort=code lists by item number ascending (non-numeric skus last)', async () => {
        emptyPage();

        await service.findAll({ sort: 'code' });

        expect(mockSupabase.order).toHaveBeenNthCalledWith(1, 'sku_sort', {
          ascending: true,
          nullsFirst: false,
        });
        expect(mockSupabase.order).toHaveBeenNthCalledWith(2, 'id', {
          ascending: true,
        });
      });

      it('default (newest) breaks created_at ties by id', async () => {
        emptyPage();

        await service.findAll({});

        expect(mockSupabase.order).toHaveBeenNthCalledWith(1, 'created_at', {
          ascending: false,
        });
        expect(mockSupabase.order).toHaveBeenNthCalledWith(2, 'id', {
          ascending: false,
        });
      });

      it('caps the page size at 1000 (PostgREST max_rows)', async () => {
        emptyPage();

        const result = await service.findAll({ limit: 100000 });

        expect(mockSupabase.range).toHaveBeenCalledWith(0, 999);
        expect(result.pagination.limit).toBe(1000);
      });

      it('searches the second supplier code too', async () => {
        emptyPage();
        mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });

        await service.findAll({ search: 'ab1' });

        expect(mockSupabase.or).toHaveBeenCalledWith(
          'name.ilike."%ab1%",sku.ilike."%ab1%",sku2.ilike."%ab1%",sku2_alt.ilike."%ab1%"',
        );
      });

      it('puts exact code matches first on page 1, without duplicates', async () => {
        mockSupabase.range.mockResolvedValueOnce({
          data: [
            { id: 1, sku: '1', name: 'Brinco 7mm' },
            { id: 7, sku: '7', name: 'Anel' },
            { id: 17, sku: '17', name: 'Colar' },
          ],
          error: null,
          count: 3,
        });
        mockSupabase.limit.mockResolvedValueOnce({
          data: [{ id: 7, sku: '7', sku2: 'X', sku2_alt: null, name: 'Anel' }],
          error: null,
        });

        const result = await service.findAll({ search: ' 7 ' });

        expect(result.data.map((p) => p.id)).toEqual([7, 1, 17]);
        expect(result.data[0].exact_match).toBe(true);
        expect(result.pagination.total).toBe(3);
        // exato em sku/sku2/sku2_alt + id (termo numérico), já aparado
        expect(mockSupabase.or).toHaveBeenLastCalledWith(
          'sku.in.("7"),sku2.in.("7"),sku2_alt.in.("7"),id.eq.7',
        );
      });

      it('does not run the exact query after page 1', async () => {
        emptyPage();

        await service.findAll({ page: 2, search: '7' });

        expect(mockSupabase.or).toHaveBeenCalledTimes(1);
        expect(mockSupabase.limit).not.toHaveBeenCalled();
      });
    });
  });

  describe('lookup', () => {
    it('ranks sku, then sku2, then sku2_alt, then id', async () => {
      mockSupabase.limit.mockResolvedValueOnce({
        data: [
          { id: 3, sku: '3', sku2: 'zz', sku2_alt: 'AB12' },
          { id: 9, sku: '9', sku2: 'AB12', sku2_alt: null },
          { id: 5, sku: 'ab12', sku2: 'q', sku2_alt: null },
        ],
        error: null,
      });

      const result = await service.lookup('ab12');

      expect(result.map((p) => p.id)).toEqual([5, 9, 3]);
      expect(mockSupabase.or).toHaveBeenCalledWith(
        'sku.in.("ab12","AB12"),sku2.in.("ab12","AB12"),sku2_alt.in.("ab12","AB12")',
      );
    });

    it('filters active products when asked (PDV)', async () => {
      mockSupabase.limit.mockResolvedValueOnce({ data: [], error: null });

      await service.lookup('7', true);

      expect(mockSupabase.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('returns nothing for a blank code without querying', async () => {
      const result = await service.lookup('   ');

      expect(result).toEqual([]);
      expect(mockSupabase.from).not.toHaveBeenCalled();
    });
  });

  describe('label_text e sku2_alt', () => {
    it('create trims label_text and uppercases sku2_alt', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: { id: 1 },
        error: null,
      });

      await service.create({
        name: 'Anel',
        sku2: 'A1',
        short_description: 'Anel',
        price: 10,
        purchase_date: '2026-01-01',
        label_text: '  LINHA PRATA ',
        sku2_alt: ' b2 ',
      });

      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({ label_text: 'LINHA PRATA', sku2_alt: 'B2' }),
      );
    });

    it('update clears with empty string and leaves untouched when omitted', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: { id: 1 }, error: null }) // findOne
        .mockResolvedValueOnce({ data: { id: 1 }, error: null }); // update

      await service.update(1, { label_text: '' });

      const payload = (mockSupabase.update.mock.calls[0] as unknown[])[0] as {
        label_text?: string | null;
        sku2_alt?: string | null;
      };
      expect(payload.label_text).toBeNull();
      expect(payload.sku2_alt).toBeUndefined();
    });

    it('rejects label_text longer than 24 characters', async () => {
      const errors = await validate(
        plainToInstance(UpdateProductDto, { label_text: 'x'.repeat(25) }),
      );
      expect(errors.map((e) => e.property)).toContain('label_text');
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

  describe('setActiveMany', () => {
    it('updates is_active for the ids and returns a non-empty JSON body', async () => {
      mockSupabase.select.mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        error: null,
      });

      const result = await service.setActiveMany([1, 2], false);

      expect(mockSupabase.update).toHaveBeenCalledWith({ is_active: false });
      expect(mockSupabase.in).toHaveBeenCalledWith('id', [1, 2]);
      expect(result).toEqual({ updated: 2 });
    });
  });
});

describe('BulkStatusDto', () => {
  const errorsFor = async (body: object) =>
    validate(plainToInstance(BulkStatusDto, body));

  it('accepts a list of ids and a boolean', async () => {
    expect(await errorsFor({ ids: [1, 2], is_active: true })).toHaveLength(0);
  });

  it('rejects empty, non-integer or missing ids and non-boolean status', async () => {
    expect(await errorsFor({ ids: [], is_active: true })).not.toHaveLength(0);
    expect(await errorsFor({ ids: ['1'], is_active: true })).not.toHaveLength(
      0,
    );
    expect(await errorsFor({ is_active: true })).not.toHaveLength(0);
    expect(await errorsFor({ ids: [1], is_active: 'sim' })).not.toHaveLength(0);
  });
});
