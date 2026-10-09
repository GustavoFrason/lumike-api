import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ProductsImagesService } from './products-images.service';

describe('ProductsImagesService.uploadToStorage', () => {
  let service: ProductsImagesService;
  let bucket: {
    upload: jest.Mock;
    getPublicUrl: jest.Mock;
  };
  let storageFrom: jest.Mock;

  const jpegBuffer = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(32),
  ]);

  const fileOf = (
    buffer: Buffer,
    originalname = 'foto.png',
    mimetype = 'image/png',
  ) =>
    ({
      buffer,
      originalname,
      mimetype,
      size: buffer.length,
    }) as Express.Multer.File;

  beforeEach(async () => {
    bucket = {
      upload: jest.fn().mockResolvedValue({ error: null }),
      getPublicUrl: jest.fn((path: string) => ({
        data: { publicUrl: `https://cdn.example/produtos/${path}` },
      })),
    };
    storageFrom = jest.fn().mockReturnValue(bucket);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsImagesService,
        {
          provide: 'SUPABASE_CLIENT',
          useValue: { storage: { from: storageFrom } },
        },
      ],
    }).compile();

    service = module.get<ProductsImagesService>(ProductsImagesService);
  });

  it('uploads under the given folder using the type detected from the bytes', async () => {
    // Nome e mimetype dizem PNG, mas os bytes são JPEG: vale o conteúdo.
    const result = await service.uploadToStorage('123', fileOf(jpegBuffer));

    expect(storageFrom).toHaveBeenCalledWith('produtos');
    const [path, , options] = bucket.upload.mock.calls[0] as [
      string,
      Buffer,
      { contentType: string; upsert: boolean },
    ];
    expect(path).toMatch(/^123\/\d+-[0-9a-f]{8}\.jpg$/);
    expect(options.contentType).toBe('image/jpeg');
    expect(options.upsert).toBe(false);
    expect(result.path).toBe(path);
    expect(result.url).toBe(`https://cdn.example/produtos/${path}`);
  });

  it('rejects files that are not images, whatever their name says', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    await expect(
      service.uploadToStorage('banners', fileOf(svg, 'x.jpg', 'image/jpeg')),
    ).rejects.toThrow(BadRequestException);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('hides storage error details from the client', async () => {
    bucket.upload.mockResolvedValueOnce({
      error: { message: 'internal bucket policy xyz' },
    });

    await expect(
      service.uploadToStorage('categorias', fileOf(jpegBuffer)),
    ).rejects.not.toThrow(/policy xyz/);
  });
});
