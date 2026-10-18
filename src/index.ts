import { app } from './app';
import { config, validateProductionConfig } from './config';
import { runtimePool } from './db/pool';

// Enforce production security readiness
const prodCheck = validateProductionConfig();
if (!prodCheck.valid) {
  console.error('[CONFIG_FATAL] Insecure configuration detected for current environment:');
  prodCheck.errors.forEach((e) => console.error(`  - ${e}`));
  if (config.env === 'production') {
    process.exit(1);
  }
}

const server = app.listen(config.port, () => {
  console.log(`Smart Municipal Waste Management Backend running on port ${config.port} (${config.env})`);
  console.log(`API Base: http://localhost:${config.port}/api/v1`);
});

// Graceful shutdown
const shutdown = async () => {
  console.log('\nShutting down gracefully...');
  server.close(async () => {
    try {
      await runtimePool.end();
      console.log('Database pool closed.');
      process.exit(0);
    } catch (err) {
      console.error('Error during pool shutdown:', err);
      process.exit(1);
    }
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
