/**
 * AuthService
 * --------------------
 * Responsável por validar credenciais e gerar tokens JWT.
 * Faz consulta à tabela "users" no Supabase.
 */

import { Injectable, UnauthorizedException, Inject, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupabaseClient } from '@supabase/supabase-js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @Inject('SUPABASE_CLIENT') private readonly supabase: SupabaseClient,
    private readonly jwtService: JwtService,
  ) { }

  /** Valida usuário com base em email e senha */
  async validateUser(email: string, senha: string) {
    // Busca usuário primeiro
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (userError) {
      console.error('Erro ao buscar usuário:', userError);
      throw new UnauthorizedException('Erro ao buscar usuário');
    }

    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }

    // Compara hash armazenado com a senha digitada
    const valid = await bcrypt.compare(senha, user.password);
    if (!valid) {
      throw new UnauthorizedException('Senha incorreta');
    }

    // Busca o role separadamente se necessário
    let roleName = null;
    if (user.role_id) {
      const { data: role, error: roleError } = await this.supabase
        .from('roles')
        .select('name')
        .eq('id', user.role_id)
        .single();

      if (!roleError && role) {
        roleName = role.name;
      }
    }

    return { ...user, roleName };
  }

  /** Gera JWT */
  async login(email: string, senha: string) {
    try {
      const user = await this.validateUser(email, senha);

      // Pega o nome do role
      const roleName = user.roleName || null;

      if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET não configurado');
      }

      const payload = {
        sub: user.id,
        email: user.email,
        role: roleName,
        role_id: user.role_id
      };

      const token = await this.jwtService.signAsync(payload, {
        secret: process.env.JWT_SECRET,
        expiresIn: '8h',
      });

      return {
        access_token: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: roleName,
          role_id: user.role_id,
        },
      };
    } catch (error) {
      console.error('Erro no login:', error);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Erro ao realizar login');
    }
  }
  /** Registra novo usuário */
  async register(data: { name: string; email: string; senha: string; whatsapp?: string }) {
    // 1. Verificar se email já existe
    const { data: existingUser } = await this.supabase
      .from('users')
      .select('id')
      .eq('email', data.email)
      .maybeSingle();

    if (existingUser) {
      throw new UnauthorizedException('Email já cadastrado.');
    }

    // 2. Buscar ID do role 'client' ou 'customer'
    let { data: role } = await this.supabase
      .from('roles')
      .select('id')
      .in('name', ['client', 'customer', 'user'])
      .maybeSingle();

    // Se não existir, CRIA o role 'customer' automaticamente
    if (!role) {
      console.log("Role de cliente não encontrado. Criando role 'customer'...");
      const { data: newRole, error: createRoleError } = await this.supabase
        .from('roles')
        .insert({ name: 'customer' })
        .select('id')
        .single();

      if (createRoleError) {
        throw new InternalServerErrorException(`Erro ao criar role 'customer': ${createRoleError.message}`);
      }
      role = newRole;
    }

    if (!role) {
      throw new InternalServerErrorException("Impossível definir papel do usuário.");
    }

    // 3. Hash da senha
    const hashedPassword = await bcrypt.hash(data.senha, 10);

    // 4. Inserir usuário
    const { data: newUser, error } = await this.supabase
      .from('users')
      .insert({
        name: data.name,
        email: data.email,
        password: hashedPassword,
        whatsapp: data.whatsapp,
        role_id: role.id,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Erro Supabase ao criar usuário:', error);
      // Retornar o erro exato do banco para facilitar debug
      throw new BadRequestException(`Erro Banco de Dados: ${error.message} (${error.details || ''})`);
    }

    // 5. Vincular/Criar Cliente (Customer) para Vendas
    const { data: existingCustomer } = await this.supabase
      .from('customers')
      .select('id')
      .eq('email', data.email)
      .maybeSingle();

    if (existingCustomer) {
      // Se já existe (criado pelo admin), apenas vincula o usuário
      await this.supabase
        .from('customers')
        .update({ user_id: newUser.id })
        .eq('id', existingCustomer.id);
    } else {
      // Se não existe, cria um novo cliente vinculado
      await this.supabase
        .from('customers')
        .insert({
          name: data.name,
          email: data.email,
          phone: data.whatsapp, // Mapeia whatsapp do user para phone do customer
          user_id: newUser.id,
        });
    }

    // Retorna o usuário sem a senha
    const { password, ...result } = newUser;
    return result;
  }
}