/**
 * StaffRole
 * --------------------
 * Nomes de papel (roles) reconhecidos pelo backend. Precisam bater
 * exatamente com a coluna `roles.name` semeada em
 * `supabase/migrations/20251105163118_init_schema.sql`.
 *
 * Qualquer usuário fora dessa lista (ex: `customer`, criado no
 * auto-registro público) é tratado como cliente final, não como staff.
 */
export enum StaffRole {
  ADMIN = 'admin',
  GESTOR = 'gestor',
  VENDEDOR = 'vendedor',
}

/** Todos os papéis de staff — usado em rotas operacionais amplas (ex: PDV). */
export const ALL_STAFF_ROLES = [
  StaffRole.ADMIN,
  StaffRole.GESTOR,
  StaffRole.VENDEDOR,
];

/** Papéis com acesso de gestão (CRUD de catálogo, financeiro, compras). */
export const MANAGEMENT_ROLES = [StaffRole.ADMIN, StaffRole.GESTOR];

/** Verifica se um nome de papel corresponde a algum papel de staff conhecido. */
export function isStaffRole(
  role: string | null | undefined,
): role is StaffRole {
  return !!role && (ALL_STAFF_ROLES as string[]).includes(role);
}
