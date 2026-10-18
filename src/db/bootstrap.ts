import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { config } from '../config';
import { adminPool } from './pool';

/**
 * Bootstrap runner: executed out-of-band by DBA administrator to provision roles
 * and set up schema ownership before ordinary migrations are applied.
 */
export async function runBootstrap(options: { endPool?: boolean } = {}): Promise<void> {
  const bootstrapFile = path.resolve(__dirname, 'bootstrap.sql');
  if (!fs.existsSync(bootstrapFile)) {
    throw new Error(`Bootstrap SQL script not found at ${bootstrapFile}`);
  }

  // 1. Ensure target database exists (connecting to default 'postgres' maintenance DB if possible)
  try {
    const maintenanceClient = new Client({
      host: config.database.host,
      port: config.database.port,
      database: 'postgres',
      user: config.database.roles.admin.user,
      password: config.database.roles.admin.password,
    });
    await maintenanceClient.connect();
    try {
      const { rows } = await maintenanceClient.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [config.database.name]
      );
      if (rows.length === 0) {
        console.log(`Database '${config.database.name}' does not exist. Creating database...`);
        await maintenanceClient.query(`CREATE DATABASE "${config.database.name}"`);
        console.log(`Database '${config.database.name}' created successfully.`);
      }
    } finally {
      await maintenanceClient.end();
    }
  } catch (err: any) {
    // If maintenance DB is inaccessible or database already exists, proceed to direct connection
    console.log(`Maintenance DB check: ${err.message}. Proceeding to target database...`);
  }

  const sql = fs.readFileSync(bootstrapFile, 'utf8');
  console.log(`Connecting to PostgreSQL database '${config.database.name}' as administrator (${config.database.roles.admin.user})...`);

  const client = await adminPool.connect();
  try {
    console.log('Executing database role bootstrap script...');
    await client.query(sql);

    // Verify role attributes
    const { rows } = await client.query(`
      SELECT 
        rolname, 
        rolsuper, 
        rolbypassrls, 
        rolcreaterole, 
        rolcreatedb 
      FROM pg_roles 
      WHERE rolname IN ('waste_dba_admin', 'waste_migration_user', 'waste_app_user')
      ORDER BY rolname;
    `);

    console.log('Database role provisioning verified successfully:');
    console.table(rows);
  } finally {
    client.release();
    if (options.endPool !== false) {
      await adminPool.end();
    }
  }
}

if (require.main === module) {
  runBootstrap()
    .then(() => {
      console.log('Bootstrap completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Bootstrap failed:', err.message);
      process.exit(1);
    });
}
