/**
 * AuthController
 * --------------------
 * Expõe endpoint /auth/login para autenticação.
 */

import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login - rota pública, sem exigir JWT.
   * Limite apertado (5/min por IP) porque é o alvo óbvio de força bruta de
   * senha — sem isso, RBAC não ajuda em nada contra tentativa de adivinhar
   * a senha de um admin.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.senha);
  }

  /** Mesmo raciocínio do login: limita criação em massa de contas. */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body);
  }
}
