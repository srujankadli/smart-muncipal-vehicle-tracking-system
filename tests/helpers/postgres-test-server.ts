import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { spawnSync } from 'child_process';
import { config } from '../../src/config';
import { resetPools } from '../../src/db/pool';
import { runBootstrap } from '../../src/db/bootstrap';
import { runMigrations } from '../../src/db/migrate';
import { seedDemoData } from '../../src/db/seed';

let activePort: number | null = null;
let activeDbDir: string | null = null;
let embeddedInstance: EmbeddedPostgres | null = null;
let isInitialized = false;

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(400);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

export async function startPostgresTestServer(portOverride?: number): Promise<{ isEmbedded: boolean; port: number }> {
  const testPort = portOverride || parseInt(process.env.TEST_DB_PORT || '5433', 10);

  // 1. If embedded instance is already running and initialized in this process, reuse immediately
  if (embeddedInstance && isInitialized && activePort === testPort) {
    console.log(`[TEST_SERVER] Reusing active disposable PostgreSQL cluster on port ${testPort}.`);
    await resetPools();
    return { isEmbedded: true, port: testPort };
  }

  // 2. Check if PostgreSQL server is already listening on 127.0.0.1:testPort
  const open = await isPortOpen(testPort);
  if (open) {
    console.log(`[TEST_SERVER] PostgreSQL server already active on port ${testPort}. Reusing running cluster.`);
    process.env.DB_HOST = '127.0.0.1';
    process.env.DB_PORT = String(testPort);
    process.env.DB_NAME = 'waste_management_dev';
    process.env.DB_APP_USER = 'waste_app_user';
    process.env.DB_APP_PASSWORD = 'app_local_dev_secret_only';
    process.env.DB_ADMIN_USER = 'waste_dba_admin';
    process.env.DB_ADMIN_PASSWORD = 'dba_local_dev_secret_only';
    await resetPools();
    await runMigrations();
    await seedDemoData();
    activePort = testPort;
    isInitialized = true;
    return { isEmbedded: false, port: testPort };
  }

  // 3. Start disposable Embedded PostgreSQL instance
  const dbDir = path.resolve(process.cwd(), `.tmp_test_pg_${testPort}`);

  // If directory exists from prior unclean shutdown, clean it up with retries for Windows
  if (fs.existsSync(dbDir)) {
    const pgCtl = path.resolve(process.cwd(), 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
    if (fs.existsSync(pgCtl)) {
      try {
        spawnSync(pgCtl, ['stop', '-D', dbDir, '-m', 'immediate', '-w'], { timeout: 3000 });
      } catch {}
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      try {
        fs.rmSync(dbDir, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  }

  console.log(`[TEST_SERVER] Initializing disposable PostgreSQL 16+ on port ${testPort}...`);
  embeddedInstance = new EmbeddedPostgres({
    databaseDir: dbDir,
    port: testPort,
    user: 'postgres',
    password: 'password',
    persistent: false,
  });

  await embeddedInstance.initialise();
  await embeddedInstance.start();
  console.log(`[TEST_SERVER] Disposable PostgreSQL started successfully on port ${testPort}.`);

  activePort = testPort;
  activeDbDir = dbDir;

  // Configure environment to point to disposable cluster
  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(testPort);
  process.env.DB_NAME = 'waste_management_dev';
  process.env.DB_ADMIN_USER = 'postgres';
  process.env.DB_ADMIN_PASSWORD = 'password';

  await resetPools();

  // Run Bootstrap as cluster administrator
  console.log('[TEST_SERVER] Running database role bootstrap...');
  await runBootstrap({ endPool: false });

  // Update admin credentials to waste_dba_admin now that it has been created
  process.env.DB_ADMIN_USER = 'waste_dba_admin';
  process.env.DB_ADMIN_PASSWORD = 'dba_local_dev_secret_only';
  await resetPools();

  // Run Migrations as waste_migration_user
  console.log('[TEST_SERVER] Running migrations as waste_migration_user...');
  await runMigrations();

  // Run Seed Demo Data as waste_app_user
  console.log('[TEST_SERVER] Seeding synthetic demo data...');
  await seedDemoData();

  console.log('[TEST_SERVER] Database bootstrap, migration, and seeding sequence complete.');
  isInitialized = true;
  return { isEmbedded: true, port: testPort };
}

export async function stopPostgresTestServer(): Promise<void> {
  console.log('[TEST_SERVER] Tearing down connection pools and disposable PostgreSQL server...');
  await resetPools();

  if (embeddedInstance) {
    if (activeDbDir) {
      const pgCtl = path.resolve(process.cwd(), 'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe');
      if (fs.existsSync(pgCtl)) {
        try {
          spawnSync(pgCtl, ['stop', '-D', activeDbDir, '-m', 'immediate', '-w'], { timeout: 3000 });
        } catch {}
      }
    }

    try {
      await Promise.race([
        embeddedInstance.stop(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
      console.log('[TEST_SERVER] Disposable PostgreSQL stopped cleanly.');
    } catch (err: any) {
      // Safe cleanup ignore
    }
    embeddedInstance = null;
    isInitialized = false;
    activePort = null;
    activeDbDir = null;
    await new Promise((r) => setTimeout(r, 300));
  }
}
