import { withTenantTransaction } from '../db/pool';
import { config } from '../config';

export interface CreatePropertyInput {
  localityId: string;
  citizenUserId?: string;
  propertyType: 'RESIDENTIAL' | 'COMMERCIAL' | 'INSTITUTIONAL';
  addressLine: string;
  customIdentifier?: string; // Used if strategy is MUNICIPAL_PIN or BIDIRECTIONAL_MAPPING
}

export class PropertyService {
  /**
   * Generates a unique property identifier based on configured strategy
   */
  public static async generatePropertyIdentifier(tenantId: string, customIdentifier?: string): Promise<string> {
    const strategy = config.policies.propertyIdStrategy;

    if (strategy === 'MUNICIPAL_PIN' && customIdentifier) {
      return customIdentifier.trim();
    }

    if (strategy === 'BIDIRECTIONAL_MAPPING' && customIdentifier) {
      return `MAP-${customIdentifier.trim()}`;
    }

    // Default: PLATFORM_GENERATED strategy
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const year = new Date().getFullYear();
    return `PROP-${year}-${randomHex}`;
  }

  /**
   * Register a new service property within tenant context
   */
  public static async createProperty(tenantId: string, input: CreatePropertyInput): Promise<any> {
    const propertyIdentifier = await this.generatePropertyIdentifier(tenantId, input.customIdentifier);

    return withTenantTransaction(tenantId, async (client) => {
      // Verify locality belongs to this tenant
      const { rows: locRows } = await client.query(
        'SELECT id FROM localities WHERE id = $1 AND tenant_id = $2',
        [input.localityId, tenantId]
      );
      if (locRows.length === 0) {
        throw new Error('INVALID_LOCALITY: Specified locality does not exist within this municipality.');
      }

      const sql = `
        INSERT INTO properties (
          tenant_id,
          locality_id,
          citizen_user_id,
          property_identifier,
          property_type,
          address_line
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, tenant_id, locality_id, citizen_user_id, property_identifier, property_type, address_line, is_active, is_demo, created_at
      `;
      const { rows } = await client.query(sql, [
        tenantId,
        input.localityId,
        input.citizenUserId || null,
        propertyIdentifier,
        input.propertyType,
        input.addressLine,
      ]);

      return rows[0];
    });
  }

  /**
   * List properties for a tenant (with optional citizen filtering)
   */
  public static async getProperties(tenantId: string, citizenUserId?: string): Promise<any[]> {
    return withTenantTransaction(tenantId, async (client) => {
      let sql = `
        SELECT 
          p.id,
          p.locality_id,
          p.citizen_user_id,
          p.property_identifier,
          p.property_type,
          p.address_line,
          p.is_active,
          p.is_demo,
          p.created_at,
          l.locality_name,
          w.ward_number,
          w.ward_name,
          u.full_name AS citizen_name,
          u.mobile_number AS citizen_mobile
        FROM properties p
        JOIN localities l ON l.id = p.locality_id
        JOIN wards w ON w.id = l.ward_id
        LEFT JOIN users u ON u.id = p.citizen_user_id
        WHERE p.tenant_id = $1
      `;
      const params: any[] = [tenantId];
      if (citizenUserId) {
        sql += ' AND p.citizen_user_id = $2';
        params.push(citizenUserId);
      }
      sql += ' ORDER BY p.created_at DESC';

      const { rows } = await client.query(sql, params);
      return rows;
    });
  }

  /**
   * Get active assessment rates (tariffs) for the tenant
   */
  public static async getAssessmentRates(tenantId: string): Promise<any[]> {
    return withTenantTransaction(tenantId, async (client) => {
      const sql = `
        SELECT 
          id,
          property_type,
          billing_frequency,
          base_fee_minor_units,
          tax_rate_basis_points,
          tax_status_note,
          effective_from,
          effective_to,
          is_active,
          is_demo
        FROM assessment_rates
        WHERE tenant_id = $1 AND is_active = TRUE
        ORDER BY property_type ASC
      `;
      const { rows } = await client.query(sql, [tenantId]);
      return rows.map((r) => ({
        ...r,
        base_fee_minor_units: r.base_fee_minor_units.toString(), // Convert BigInt to string for JSON serialization
      }));
    });
  }
}
