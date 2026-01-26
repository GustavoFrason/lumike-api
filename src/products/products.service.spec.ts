import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { NotFoundException } from '@nestjs/common';

describe('ProductsService', () => {
    let service: ProductsService;
    let mockSupabase: any;

    beforeEach(async () => {
        jest.setTimeout(10000); // Increase timeout
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            range: jest.fn().mockReturnThis(),
            single: jest.fn(),
            maybeSingle: jest.fn(),
            upsert: jest.fn().mockReturnThis(),
        };

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
        const createDto = {
            name: 'Test Product',
            sku: 'TEST-SKU',
            price: 100,
            current_stock: 10,
        };

        it('should throw error if SKU already exists', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({ data: { id: 1 } });

            await expect(service.create(createDto as any)).rejects.toThrow(
                "Produto com SKU 'TEST-SKU' já existe!"
            );
        });

        it('should create product if SKU is unique', async () => {
            mockSupabase.maybeSingle.mockResolvedValue({ data: null });
            mockSupabase.single.mockResolvedValue({ data: { id: 2, ...createDto }, error: null });

            const result = await service.create(createDto as any);

            expect(result.id).toBe(2);
            expect(mockSupabase.insert).toHaveBeenCalled();
        });
    });

    describe('findAll', () => {
        it('should return paginated products', async () => {
            const mockData = [{ id: 1, name: 'P1' }, { id: 2, name: 'P2' }];

            const mockQuery: any = Promise.resolve({ data: mockData, error: null, count: 2 });
            mockQuery.eq = jest.fn().mockReturnThis();
            mockQuery.order = jest.fn().mockReturnThis();
            mockQuery.range = jest.fn().mockReturnThis();

            mockSupabase.select.mockReturnValue(mockQuery);

            const result = await service.findAll(1, 10);

            expect(result.data).toHaveLength(2);
            expect(result.pagination.total).toBe(2);
        });
    });

    describe('findOne', () => {
        it('should return a product if found', async () => {
            mockSupabase.single.mockResolvedValue({ data: { id: 1, name: 'Test' }, error: null });

            const result = await service.findOne(1);
            expect(result.id).toBe(1);
        });

        it('should throw NotFoundException if not found', async () => {
            mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'Not found' } });

            await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
        });
    });
});
