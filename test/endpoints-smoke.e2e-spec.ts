import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { ExecutionContext } from '@nestjs/common';

describe('Endpoints Smoke Test (e2e)', () => {
    let app: INestApplication;

    const mockJwtGuard = {
        canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest();
            req.user = { id: 1, sub: 1, email: 'admin@lumilee.com.br' };
            return true;
        },
    };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideGuard(JwtAuthGuard)
            .useValue(mockJwtGuard)
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({ transform: true }));
        await app.init();
    }, 30000); // Higher timeout for slow cold start

    afterAll(async () => {
        await app.close();
    });

    const checkEndpoint = async (url: string) => {
        const res = await request(app.getHttpServer()).get(url);
        if (res.status !== 200) {
            console.error(`FAILED ${url}: Status ${res.status}`, JSON.stringify(res.body, null, 2));
        }
        expect(res.status).toBe(200);
    };

    it('/accessory-purchases (GET)', () => checkEndpoint('/accessory-purchases'));

    // Stock Notifications - Service uses user_id, check controller route
    // If controller is @Controller('stock-notifications'), route is /stock-notifications/my-alerts
    it('/stock-notifications/my-alerts (GET)', () => checkEndpoint('/stock-notifications/my-alerts'));

    // Favorites - Service uses user_id
    it('/favorites (GET)', () => checkEndpoint('/favorites'));

    it('/cash-flow (GET)', () => checkEndpoint('/cash-flow'));
    it('/orders (GET)', () => checkEndpoint('/orders'));
    it('/products (GET)', () => checkEndpoint('/products'));
});
