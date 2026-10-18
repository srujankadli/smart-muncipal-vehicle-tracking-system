import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';

let _runtimePool: Pool | null = null;
let _migrationPool: Pool | null = null;
let _adminPool: Pool | null = null;

export function getRuntimePool(): Pool {
  if (!_runtimePool) {
    _runtimePool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.roles.runtime.user,
      password: config.database.roles.runtime.password,
      max: config.database.maxConnections,
      idleTimeoutMillis: config.database.idleTimeoutMillis,
      connectionTimeoutMillis: 5000,
    });
  }
  return _runtimePool;
}

export function getMigrationPool(): Pool {
  if (!_migrationPool) {
    _migrationPool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.roles.migration.user,
      password: config.database.roles.migration.password,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  }
  return _migrationPool;
}

export function getAdminPool(): Pool {
  if (!_adminPool) {
    _adminPool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.roles.admin.user,
      password: config.database.roles.admin.password,
      max: 2,
      idleTimeoutMillis: 10000,
    });
  }
  return _adminPool;
}

export async function resetPools(): Promise<void> {
  const promises: Promise<void>[] = [];
  if (_runtimePool) {
    promises.push(_runtimePool.end());
    _runtimePool = null;
  }
  if (_migrationPool) {
    promises.push(_migrationPool.end());
    _migrationPool = null;
  }
  if (_adminPool) {
    promises.push(_adminPool.end());
    _adminPool = null;
  }
  await Promise.all(promises);
}

// Primary connection pool configured for unprivileged runtime role (waste_app_user)
export const runtimePool = new Proxy({} as Pool, {
  get(target, prop) {
    const p = getRuntimePool();
    const val = (p as any)[prop];
    return typeof val === 'function' ? val.bind(p) : val;
  },
});

// Dedicated migration pool configured for schema owner (waste_migration_user)
export const migrationPool = new Proxy({} as Pool, {
  get(target, prop) {
    const p = getMigrationPool();
    const val = (p as any)[prop];
    return typeof val === 'function' ? val.bind(p) : val;
  },
});

// Dedicated administrative pool (waste_dba_admin) for out-of-band operations
export const adminPool = new Proxy({} as Pool, {
  get(target, prop) {
    const p = getAdminPool();
    const val = (p as any)[prop];
    return typeof val === 'function' ? val.bind(p) : val;
  },
});

/**
 * Execute a query with tenant context inside a dedicated transaction.
 * Strictly sets transaction-local context (`set_config('app.current_tenant_id', $1, true)`)
 * ensuring that connection pooling reuse never leaks tenant state.
 */
export async function withTenantTransaction<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
  pool: Pool = runtimePool
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Set transaction-local tenant context (is_local = true)
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [tenantId]);
    
    const result = await fn(client);
    
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // Ignore rollback errors during failed connections
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a query without tenant context (for public discovery, authentication, etc.)
 */
export async function query<R extends QueryResultRow = any>(
  text: string,
  params?: any[],
  pool: Pool = runtimePool
): Promise<QueryResult<R>> {
  return pool.query<R>(text, params);
}
