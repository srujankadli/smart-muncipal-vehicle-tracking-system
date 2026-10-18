import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { query, runtimePool } from '../db/pool';

export interface TokenPayload {
  userId: string;
  mobileNumber: string;
}

export interface VerifiedMembership {
  membershipId: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
  isDemo: boolean;
}

export class AuthService {
  private static readonly SALT_ROUNDS = 10;

  public static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  public static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  public static generateToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn as any,
    });
  }

  public static verifyToken(token: string): TokenPayload {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as TokenPayload;
      if (!decoded.userId || !decoded.mobileNumber) {
        throw new Error('Invalid token structure');
      }
      return decoded;
    } catch (err: any) {
      throw new Error(`Authentication token verification failed: ${err.message}`);
    }
  }

  /**
   * Derive verified tenant membership from authenticated user.
   * NEVER trust client-provided tenant headers or slugs without membership verification.
   */
  public static async getVerifiedMembership(
    userId: string,
    requestedTenantId?: string
  ): Promise<VerifiedMembership> {
    let sql = `
      SELECT 
        m.id AS membership_id,
        m.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        r.role_name,
        t.is_demo
      FROM user_tenant_memberships m
      JOIN tenants t ON t.id = m.tenant_id
      JOIN user_roles r ON r.id = m.role_id
      WHERE m.user_id = $1 
        AND m.is_active = TRUE
        AND t.is_active = TRUE
    `;
    const params: any[] = [userId];

    if (requestedTenantId) {
      sql += ' AND m.tenant_id = $2';
      params.push(requestedTenantId);
    }

    sql += ' ORDER BY m.created_at ASC LIMIT 1';

    const client = await runtimePool.connect();
    let rows: any[];
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.membership_lookup', 'true', true)");
      const res = await client.query(sql, params);
      rows = res.rows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    if (rows.length === 0) {
      throw new Error('USER_NOT_AUTHORIZED_FOR_TENANT: User has no active membership in the specified municipality.');
    }

    const row = rows[0];
    return {
      membershipId: row.membership_id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      roleName: row.role_name,
      isDemo: Boolean(row.is_demo),
    };
  }

  /**
   * List all verified municipal memberships for a user
   */
  public static async getUserMemberships(userId: string): Promise<VerifiedMembership[]> {
    const sql = `
      SELECT 
        m.id AS membership_id,
        m.tenant_id,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        r.role_name,
        t.is_demo
      FROM user_tenant_memberships m
      JOIN tenants t ON t.id = m.tenant_id
      JOIN user_roles r ON r.id = m.role_id
      WHERE m.user_id = $1 
        AND m.is_active = TRUE
        AND t.is_active = TRUE
      ORDER BY t.name ASC
    `;

    const client = await runtimePool.connect();
    let rows: any[];
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.membership_lookup', 'true', true)");
      const res = await client.query(sql, [userId]);
      rows = res.rows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    return rows.map((row) => ({
      membershipId: row.membership_id,
      tenantId: row.tenant_id,
      tenantName: row.tenant_name,
      tenantSlug: row.tenant_slug,
      roleName: row.role_name,
      isDemo: Boolean(row.is_demo),
    }));
  }
}
