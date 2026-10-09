import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService, USER_SAFE_COLUMNS } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  createMockSupabaseClient,
  MockSupabaseClient,
} from '../test-utils/supabase-mock';

describe('UsersService', () => {
  let service: UsersService;
  let mockSupabase: MockSupabaseClient;

  beforeEach(async () => {
    mockSupabase = createMockSupabaseClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: 'SUPABASE_CLIENT', useValue: mockSupabase },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('never selects the password column in USER_SAFE_COLUMNS', () => {
    expect(USER_SAFE_COLUMNS).not.toMatch(/password|\*/);
  });

  it('create returns only safe columns and hashes the given password', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 1, name: 'Ana' },
      error: null,
    });

    await service.create({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'segredo123',
      role_id: 3,
    });

    expect(mockSupabase.select).toHaveBeenCalledWith(USER_SAFE_COLUMNS);
    const inserted = (mockSupabase.insert.mock.calls[0] as unknown[])[0] as {
      password: string;
    };
    expect(inserted.password).not.toBe('segredo123');
    expect(inserted.password).toMatch(/^\$2[aby]\$/);
  });

  it('update returns only safe columns', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 1, name: 'Ana' },
      error: null,
    });

    await service.update(1, { name: 'Ana Maria' });

    expect(mockSupabase.select).toHaveBeenCalledWith(USER_SAFE_COLUMNS);
  });

  it('updateCommissionRate returns only safe columns', async () => {
    mockSupabase.single.mockResolvedValueOnce({
      data: { id: 1, commission_rate: 15 },
      error: null,
    });

    await service.updateCommissionRate(1, 15);

    expect(mockSupabase.select).toHaveBeenCalledWith(USER_SAFE_COLUMNS);
  });
});

describe('User DTOs', () => {
  it('CreateUserDto requires a password (no hardcoded fallback)', async () => {
    const dto = plainToInstance(CreateUserDto, {
      name: 'Ana',
      email: 'ana@example.com',
      role_id: 3,
    });

    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('password');
  });

  it('UpdateUserDto accepts an empty password (form sends "" when unchanged)', async () => {
    const dto = plainToInstance(UpdateUserDto, { name: 'Ana', password: '' });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.password).toBeUndefined();
  });

  it('UpdateUserDto still rejects a too-short password', async () => {
    const dto = plainToInstance(UpdateUserDto, { password: '123' });

    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('password');
  });
});
