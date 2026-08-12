import {
  Injectable,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/supabase';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject('SUPABASE_CLIENT')
    private readonly supabase: SupabaseClient<Database>,
  ) {}

  /**
   * Lista todos os usuários (com paginação simples)
   */
  async findAll() {
    const { data, error } = await this.supabase
      .from('users')
      .select(
        `
        id, 
        name, 
        email, 
        is_active,
        commission_rate,
        roles:role_id (id, name)
      `,
      )
      .order('name');

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar usuários: ${error.message}`,
      );
    }

    return data || [];
  }

  /**
   * Lista todos os usuários com o papel 'vendedor'
   */
  async findSellers() {
    const { data: role, error: roleError } = await this.supabase
      .from('roles')
      .select('id')
      .eq('name', 'vendedor')
      .single();

    if (roleError || !role) {
      return [];
    }

    const { data: users, error } = await this.supabase
      .from('users')
      .select('id, name, email, commission_rate')
      .eq('role_id', role.id)
      .eq('is_active', true);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar vendedores: ${error.message}`,
      );
    }

    return users || [];
  }

  /**
   * Cria um novo usuário (Ação Administrativa)
   */
  async create(userData: CreateUserDto) {
    const { name, email, password, role_id, commission_rate, is_active } =
      userData;

    // Hash da senha se fornecida, senão usa uma senha temporária padrão.
    const hashedPassword = await bcrypt.hash(password || 'Lumilee@123', 10);

    const { data, error } = await this.supabase
      .from('users')
      .insert({
        name,
        email,
        password: hashedPassword,
        role_id,
        commission_rate: commission_rate || 20,
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao criar usuário: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Atualiza dados de um usuário
   */
  async update(id: number, updateData: UpdateUserDto) {
    const { password, ...otherData } = updateData;
    const updatePayload: Partial<UpdateUserDto> & { password?: string } = {
      ...otherData,
    };

    if (password) {
      updatePayload.password = await bcrypt.hash(password, 10);
    }

    const { data, error } = await this.supabase
      .from('users')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao atualizar usuário: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Lista todos os papéis (roles) disponíveis
   */
  async getRoles() {
    const { data, error } = await this.supabase
      .from('roles')
      .select('*')
      .order('name');

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar papéis: ${error.message}`,
      );
    }

    return data || [];
  }

  /**
   * Atualiza a taxa de comissão de um usuário
   */
  async updateCommissionRate(id: number, rate: number) {
    const { data, error } = await this.supabase
      .from('users')
      .update({ commission_rate: rate })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao atualizar comissão: ${error.message}`,
      );
    }

    return data;
  }

  /**
   * Busca um usuário pelo ID
   */
  async findOne(id: number) {
    const { data, error } = await this.supabase
      .from('users')
      .select('id, name, email, role_id, commission_rate, is_active')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Usuário #${id} não encontrado`);
    }

    return data;
  }
}
