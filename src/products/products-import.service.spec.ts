import { Test, TestingModule } from '@nestjs/testing';
import { ProductsImportService } from './products-import.service';

describe('ProductsImportService', () => {
    let service: ProductsImportService;
    let mockSupabase: any;

    beforeEach(async () => {
        mockSupabase = {
            from: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            update: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            rpc: jest.fn().mockReturnThis(),
        };

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ProductsImportService,
                {
                    provide: 'SUPABASE_CLIENT',
                    useValue: mockSupabase,
                },
            ],
        }).compile();

        service = module.get<ProductsImportService>(ProductsImportService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    describe('parseNfe', () => {
        it('should correctly parse a simple NFe XML', async () => {
            const xml = `
                <nfeProc>
                    <NFe>
                        <infNFe Id="NFe123">
                            <det nItem="1">
                                <prod>
                                    <cProd>SKU123</cProd>
                                    <xProd>Produto Teste</xProd>
                                    <qCom>10.00</qCom>
                                    <vUnCom>15.50</vUnCom>
                                </prod>
                            </det>
                        </infNFe>
                    </NFe>
                </nfeProc>
            `;
            const buffer = Buffer.from(xml);

            mockSupabase.maybeSingle.mockResolvedValue({ data: null }); // New product

            const result = await service.parseNfe(buffer);

            expect(result.totalItems).toBe(1);
            expect(result.items[0].sku).toBe('SKU123');
            expect(result.items[0].action).toBe('CREATE_NEW');
        });

        it('should identify existing products', async () => {
            const xml = `
                <NFe>
                    <infNFe>
                        <det>
                            <prod>
                                <cProd>EXISTING</cProd>
                                <xProd>Ex de Prod</xProd>
                                <qCom>5</qCom>
                                <vUnCom>10</vUnCom>
                            </prod>
                        </det>
                    </infNFe>
                </NFe>
            `;
            const buffer = Buffer.from(xml);

            mockSupabase.maybeSingle.mockResolvedValue({
                data: { id: 1, name: 'Existente', current_stock: 2 }
            });

            const result = await service.parseNfe(buffer);

            expect(result.items[0].action).toBe('UPDATE_STOCK');
            expect(result.items[0].existing_product!.id).toBe(1);
        });

        it('should throw error for invalid XML', async () => {
            const buffer = Buffer.from('<invalid></invalid>');
            await expect(service.parseNfe(buffer)).rejects.toThrow('Formato de NFe inválido');
        });
    });

    describe('processImport', () => {
        it('should create new products', async () => {
            const items: any[] = [
                {
                    action: 'CREATE_NEW',
                    sku: 'NEW1',
                    name_xml: 'Novo Produto',
                    quantity_xml: 5,
                    cost_price_xml: 20
                }
            ];

            mockSupabase.insert.mockResolvedValue({ error: null });

            const result = await service.processImport(items);

            expect(result.created).toBe(1);
            expect(mockSupabase.from).toHaveBeenCalledWith('products');
            expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
                sku: 'NEW1',
                current_stock: 5
            }));
        });
    });
});
