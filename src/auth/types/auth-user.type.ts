/**
 * AuthUser
 * --------------------
 * Formato do payload decodificado do JWT, disponível em `request.user`
 * após o `JwtAuthGuard` (ver `AuthService.login`, que é quem assina o token
 * com este mesmo formato).
 */
export interface AuthUser {
  /** ID do usuário (subject do JWT). */
  sub: number;
  email: string;
  /** Nome do papel (ex: 'admin', 'gestor', 'vendedor') ou null para clientes sem papel. */
  role: string | null;
  role_id: number | null;
}
