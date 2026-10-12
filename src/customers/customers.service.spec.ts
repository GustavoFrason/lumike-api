import { Test, TestingModule } from '@nestjs/testing';
import { CustomersService } from './customers.service';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('CustomersService.findAll', () => {
  let service: CustomersService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();
    mockSupabase.range.mockResolvedValue({ data: [], error: null, count: 0 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomersService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<CustomersService>(CustomersService);
  });

  it('filters by name, email, phone and cpf when a search term is given', async () => {
    await service.findAll(1, 20, 'maria');

    expect(mockSupabase.or).toHaveBeenCalledWith(
      'name.ilike."%maria%",email.ilike."%maria%",phone.ilike."%maria%",cpf.ilike."%maria%"',
    );
    expect(mockSupabase.range).toHaveBeenCalledWith(0, 19);
  });

  it('does not filter without a search term', async () => {
    await service.findAll(1, 20);
    await service.findAll(1, 20, '   ');

    expect(mockSupabase.or).not.toHaveBeenCalled();
  });
});
