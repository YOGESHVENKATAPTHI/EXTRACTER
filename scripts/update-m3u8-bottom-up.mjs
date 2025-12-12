import { runUpdater } from './m3u8-updater-common.mjs';

const connectionString = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_rjmolz6Ecn9T@ep-autumn-hall-aho0evwl-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

runUpdater({
  connectionString,
  order: 'desc',
  startFrom: 'bottom',
  BATCH_SIZE: parseInt(process.env.BATCH_SIZE || '1000', 10),
  UPDATE_INTERVAL_MS: parseInt(process.env.UPDATE_INTERVAL_MS || '60000', 10),
  PORT: parseInt(process.env.PORT || '3000', 10),
  KEEP_ALIVE_INTERVAL_MS: parseInt(process.env.KEEP_ALIVE_INTERVAL_MS || '30000', 10),
  MAIN_SERVER_URLS: (process.env.MAIN_SERVER_URLS || 'http://localhost:3000').split(',').map(u => u.trim()),
  proxyUrl: process.env.PROXY_URL || 'https://webproxier-ov6et6gpw-ogeshs-projects.vercel.app/api/proxy?url=',
  name: 'bottom-up'
});
