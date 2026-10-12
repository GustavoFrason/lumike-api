import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ALL_STAFF_ROLES, StaffRole } from '../auth/enums/role.enum';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Gestão de usuários/equipe e papéis: só admin — é onde role_id é atribuído. */
@Roles(StaffRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  /**
   * Lista de vendedoras para os seletores (PDV, comissões, transferência
   * de estoque). Aberto a todo staff — antes era só admin e os seletores
   * vinham vazios para gestor e vendedora. Revendedora recebe só ela
   * mesma; ninguém recebe e-mail.
   */
  @Roles(...ALL_STAFF_ROLES)
  @Get('sellers')
  findSellers(@CurrentUser() user: AuthUser) {
    return this.usersService.findSellers(user);
  }

  @Get('roles')
  getRoles() {
    return this.usersService.getRoles();
  }

  @Post()
  create(@Body() body: CreateUserDto) {
    return this.usersService.create(body);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Patch(':id/commission-rate')
  updateCommissionRate(
    @Param('id', ParseIntPipe) id: number,
    @Body('rate') rate: number,
  ) {
    return this.usersService.updateCommissionRate(id, rate);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }
}
