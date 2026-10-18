import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { spawnSync } from 'child_process';
import { runBootstrap } from '../src/db/bootstrap';
import { runMigrations } from '../src/db/migrate';
import { seedDemoData } from '../src/db/seed';
import { resetPools } from '../src/db/pool';
import { createApp } from '../src/app';

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

async function main() {
  const dbPort = parseInt(process.env.DB_PORT || '5432', 10);
  const appPort = parseInt(process.env.PORT || '3000', 10);
  const isOpen = await isPortOpen(dbPort);

  let embeddedInstance: EmbeddedPostgres | null = null;

  if (isOpen) {
    console.log(`[DEV_SERVER] PostgreSQL is already listening on 127.0.0.1:${dbPort}. Using existing database.`);
  } else {
    console.log(`[DEV_SERVER] Starting local embedded PostgreSQL 18 on port ${dbPort}...`);
    const dbDir = path.resolve(process.cwd(), `.tmp_dev_pg_${dbPort}`);

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

    embeddedInstance = new EmbeddedPostgres({
      databaseDir: dbDir,
      port: dbPort,
      user: 'postgres',
      password: 'password',
      persistent: false,
    });

    await embeddedInstance.initialise();
    await embeddedInstance.start();
    console.log(`[DEV_SERVER] Embedded PostgreSQL running on port ${dbPort}.`);
  }

  process.env.DB_HOST = '127.0.0.1';
  process.env.DB_PORT = String(dbPort);
  process.env.DB_NAME = 'waste_management_dev';
  process.env.DB_ADMIN_USER = 'postgres';
  process.env.DB_ADMIN_PASSWORD = 'password';

  await resetPools();

  console.log('[DEV_SERVER] Bootstrapping database roles and schema...');
  await runBootstrap({ endPool: false });

  process.env.DB_ADMIN_USER = 'waste_dba_admin';
  process.env.DB_ADMIN_PASSWORD = 'dba_local_dev_secret_only';
  await resetPools();

  console.log('[DEV_SERVER] Running database migrations 001-007...');
  await runMigrations();

  console.log('[DEV_SERVER] Seeding synthetic municipal demo datasets...');
  await seedDemoData();

  console.log('[DEV_SERVER] Initializing Express HTTP application...');
  const app = createApp();

  const server = app.listen(appPort, () => {
    console.log(`========================================================================`);
    console.log(`Smart Municipal Waste Management Backend LIVE on http://localhost:${appPort}`);
    console.log(`Health endpoint: http://localhost:${appPort}/health`);
    console.log(`API v1 Base:     http://localhost:${appPort}/api/v1`);
    console.log(`========================================================================`);
  });

  const cleanup = async () => {
    console.log('\n[DEV_SERVER] Shutting down gracefully...');
    server.close();
    if (embeddedInstance) {
      try {
        await embeddedInstance.stop();
        console.log('[DEV_SERVER] Embedded PostgreSQL stopped.');
      } catch (e) {
        console.error('Error stopping Postgres:', e);
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('[DEV_SERVER_FATAL]', err);
  process.exit(1);
});
