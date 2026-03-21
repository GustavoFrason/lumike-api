import { Test, TestingModule } from '@nestjs/testing';
import { WarrantiesService } from './warranties.service';

describe('WarrantiesService', () => {
  let service: WarrantiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WarrantiesService],
    }).compile();

    service = module.get<WarrantiesService>(WarrantiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
