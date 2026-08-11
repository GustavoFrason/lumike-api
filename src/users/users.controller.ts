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
import { StaffRole } from '../auth/enums/role.enum';
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

  @Get('sellers')
  findSellers() {
    return this.usersService.findSellers();
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
