import { query, withTenantTransaction, runtimePool } from '../db/pool';

export interface MunicipalitySummary {
  id: string;
  tenantId: string;
  slug: string;
  officialName: string;
  stateOrUt: string;
  classification: string;
  centerLatitude: number;
  centerLongitude: number;
  isDemo: boolean;
  wardsCount: number;
  localitiesCount: number;
}

export class TenantService {
  /**
   * Public discovery endpoint: Allows unauthenticated citizens to find their municipality,
   * wards, and localities without exposing internal operational data.
   */
  public static async getPublicMunicipalities(): Promise<MunicipalitySummary[]> {
    const sql = `
      SELECT 
        m.id,
        m.tenant_id,
        t.slug,
        m.official_name,
        m.state_or_ut,
        m.classification,
        m.center_latitude,
        m.center_longitude,
        m.is_demo,
        COUNT(DISTINCT w.id)::int AS wards_count,
        COUNT(DISTINCT l.id)::int AS localities_count
      FROM municipalities m
      JOIN tenants t ON t.id = m.tenant_id
      LEFT JOIN wards w ON w.tenant_id = m.tenant_id
      LEFT JOIN localities l ON l.tenant_id = m.tenant_id
      WHERE t.is_active = TRUE
      GROUP BY m.id, m.tenant_id, t.slug, m.official_name, m.state_or_ut, m.classification, m.center_latitude, m.center_longitude, m.is_demo
      ORDER BY m.official_name ASC
    `;
    const client = await runtimePool.connect();
    let rows: any[];
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.public_discovery', 'true', true)");
      const res = await client.query(sql);
      rows = res.rows;
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      slug: r.slug,
      officialName: r.official_name,
      stateOrUt: r.state_or_ut,
      classification: r.classification,
      centerLatitude: parseFloat(r.center_latitude),
      centerLongitude: parseFloat(r.center_longitude),
      isDemo: Boolean(r.is_demo),
      wardsCount: r.wards_count,
      localitiesCount: r.localities_count,
    }));
  }

  /**
   * Get Wards for a specific tenant (executed with tenant context)
   */
  public static async getTenantWards(tenantId: string): Promise<any[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const { rows } = await client.query(
        'SELECT id, ward_number, ward_name, center_latitude, center_longitude, is_demo FROM wards WHERE tenant_id = $1 ORDER BY ward_number ASC',
        [tenantId]
      );
      return rows;
    });
  }

  /**
   * Get Localities for a specific tenant (executed with tenant context)
   */
  public static async getTenantLocalities(tenantId: string, wardId?: string): Promise<any[]> {
    return withTenantTransaction(tenantId, async (client) => {
      let sql = `
        SELECT 
          l.id, 
          l.ward_id, 
          w.ward_number, 
          w.ward_name, 
          l.locality_name, 
          l.center_latitude, 
          l.center_longitude, 
          l.is_demo 
        FROM localities l
        JOIN wards w ON w.id = l.ward_id
        WHERE l.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (wardId) {
        sql += ' AND l.ward_id = $2';
        params.push(wardId);
      }
      sql += ' ORDER BY w.ward_number ASC, l.locality_name ASC';
      const { rows } = await client.query(sql, params);
      return rows;
    });
  }
}
