/**
 * Integração leve (controller isolado + HTTP real via supertest) de
 * POST /uploads/images: garante que multer + ValidationPipe global (com
 * forbidNonWhitelisted) + FileValidationPipe aceitam o multipart que o
 * front manda e barram pasta inválida / arquivo grande. Guards de auth não
 * entram aqui (são globais no AppModule); o service é mockado.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { Server } from 'http';
import { ProductsUploadsController } from './products-uploads.controller';
import { ProductsImagesService } from './products-images.service';

describe('POST /uploads/images', () => {
  let app: INestApplication<Server>;
  const uploadToStorage = jest.fn();

  const jpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.alloc(64),
  ]);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProductsUploadsController],
      providers: [
        { provide: ProductsImagesService, useValue: { uploadToStorage } },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Mesmo pipe global de main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    uploadToStorage.mockReset();
    uploadToStorage.mockResolvedValue({
      url: 'https://x/1.jpg',
      path: '1.jpg',
    });
  });

  it('accepts a multipart file + folder and returns the public url', async () => {
    const res = await request(app.getHttpServer())
      .post('/uploads/images')
      .field('folder', '42')
      .attach('file', jpeg, 'foto.jpg');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ url: 'https://x/1.jpg', path: '1.jpg' });
    expect(uploadToStorage).toHaveBeenCalledWith(
      '42',
      expect.objectContaining({ originalname: 'foto.jpg' }),
    );
  });

  it('rejects a folder outside the allowed list', async () => {
    const res = await request(app.getHttpServer())
      .post('/uploads/images')
      .field('folder', '../../etc')
      .attach('file', jpeg, 'foto.jpg');

    expect(res.status).toBe(400);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });

  it('rejects a request without file', async () => {
    const res = await request(app.getHttpServer())
      .post('/uploads/images')
      .field('folder', '42');

    expect(res.status).toBe(400);
  });

  it('rejects files larger than 5MB with 413', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 10);
    const res = await request(app.getHttpServer())
      .post('/uploads/images')
      .field('folder', '42')
      .attach('file', big, 'grande.jpg');

    expect(res.status).toBe(413);
    expect(uploadToStorage).not.toHaveBeenCalled();
  });
});
