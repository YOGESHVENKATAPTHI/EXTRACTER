import { Client } from 'pg';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import http from 'http';
import KeepAliveService from './keep-alive.mjs';

export async function runUpdater(options = {}) {
  const {
    connectionString,
    order = 'asc', // 'asc' | 'desc'
    startFrom = 'top', // 'top' | 'bottom' | 'middle'
    BATCH_SIZE = 1000,
    UPDATE_INTERVAL_MS = 60000,
    PORT = 3000,
    KEEP_ALIVE_INTERVAL_MS = 30000,
    MAIN_SERVER_URLS = ['http://localhost:3000'],
    proxyUrl = 'https://webproxier-ov6et6gpw-ogeshs-projects.vercel.app/api/proxy?url=',
    name = 'updater'
  ,
    processAllRecords = false
  } = options;

  let updaterStarted = false;
  let updaterError = null;
  let lastUpdateCycle = null;
  let lastProcessedId = null;
  const logBuffer = [];
  const MAX_LOGS = 100;

  function logStatus(msg) {
    const line = `[${new Date().toISOString()}] [${name}] ${msg}`;
    logBuffer.push(line);
    if (logBuffer.length > MAX_LOGS) logBuffer.shift();
    process.stdout.write(line + '\n');
  }

  // Use KeepAliveService helper for multi-server keep-alive
  const keepAlive = new KeepAliveService({ intervalMs: KEEP_ALIVE_INTERVAL_MS, timeoutMs: 5000 });
  for (const s of MAIN_SERVER_URLS) {
    if (s) keepAlive.addServer(s);
  }

  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

  async function fetchMeta(entry) {
    try {
      const videoPageRes = await fetch(proxyUrl + encodeURIComponent(entry.video), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      const videoHtml = await videoPageRes.text();
      const $video = cheerio.load(videoHtml);
      const ldJson = $video('script[type="application/ld+json"]').html();
      if (ldJson) {
        const meta = JSON.parse(ldJson);
        if (meta && meta.contentUrl) {
          return meta.contentUrl;
        }
      }
    } catch (err) {
      logStatus(`[ERROR] Failed to extract video meta for video: ${entry && entry.video} - ${err}`);
    }
    return null;
  }

  async function updateM3u8() {
    updaterStarted = true;
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query(`CREATE TABLE IF NOT EXISTS video_mappings (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        video TEXT NOT NULL,
        image TEXT NOT NULL,
        url TEXT,
        uploaddate TEXT,
        tags TEXT,
        last_updated TIMESTAMP,
        UNIQUE (video)
      );`);

      // Ensure columns exist
      const columns = [
        { name: 'url', type: 'TEXT' },
        { name: 'uploaddate', type: 'TEXT' },
        { name: 'tags', type: 'TEXT' },
        { name: 'uploadedby', type: 'TEXT' },
        { name: 'size', type: 'BIGINT' },
        { name: 'type', type: 'TEXT' }
      ];
      for (const col of columns) {
        await client.query(`ALTER TABLE video_mappings ADD COLUMN IF NOT EXISTS ${col.name} ${col.type};`);
      }

      while (true) {
        try {
          // Get min, max ids, and count
          const { rows: boundsRows } = await client.query('SELECT MIN(id) as min_id, MAX(id) as max_id, COUNT(*) as cnt FROM video_mappings');
          const bounds = boundsRows[0];
          const minId = parseInt(bounds.min_id || 0, 10);
          const maxId = parseInt(bounds.max_id || 0, 10);
          const total = parseInt(bounds.cnt || 0, 10);
          if (total === 0) {
            logStatus('No mappings found. Sleeping...');
            await sleep(UPDATE_INTERVAL_MS);
            continue;
          }
          const midId = Math.floor((minId + maxId) / 2);

          // Build range query based on order / startFrom
          // We'll process in batches respecting the requested direction
          let ranges = [];

          if (startFrom === 'top') {
            // top-down: min->max ascending
            ranges.push({ from: minId, to: maxId, direction: 'asc' });
          } else if (startFrom === 'bottom') {
            // bottom-up: max->min descending
            ranges.push({ from: maxId, to: minId, direction: 'desc' });
          } else if (startFrom === 'middle-to-bottom') {
            // middle->max ascending
            ranges.push({ from: midId, to: maxId, direction: 'asc' });
            ranges.push({ from: minId, to: midId - 1, direction: 'asc' });
          } else if (startFrom === 'middle-to-top') {
            // middle->min descending
            ranges.push({ from: midId, to: minId, direction: 'desc' });
            ranges.push({ from: maxId, to: midId + 1, direction: 'desc' });
          } else {
            ranges.push({ from: minId, to: maxId, direction: 'asc' }); // fallback
          }

          let processedThisCycle = 0;
          for (const range of ranges) {
            const { from, to, direction } = range;
            if (direction === 'asc') {
              // Iterate with offset batches to avoid duplicates
              let currentFrom = from;
              while (currentFrom <= to) {
                const { rows } = await client.query(`SELECT * FROM video_mappings WHERE id >= $1 AND id <= $2 ${processAllRecords ? '' : "AND (last_updated IS NULL OR last_updated < NOW() - INTERVAL '2 hours')"} ORDER BY id ASC LIMIT $3`, [currentFrom, to, BATCH_SIZE]);
                if (!rows || rows.length === 0) break;
                logStatus(`Processing ${rows.length} rows ascending for ids ${currentFrom}-${to}`);
                for (const entry of rows) {
                  const finalUrl = await fetchMeta(entry);
                  if (finalUrl && entry.url !== finalUrl) {
                    await client.query(`UPDATE video_mappings SET url = $1, last_updated = NOW() WHERE id = $2`, [finalUrl, entry.id]);
                    logStatus(`Updated url for id ${entry.id} (${entry.name})`);
                  } else {
                    await client.query(`UPDATE video_mappings SET last_updated = NOW() WHERE id = $1`, [entry.id]);
                    logStatus(`No url update for id ${entry.id} (${entry.name})`);
                  }
                }
                processedThisCycle += rows.length;
                // move currentFrom to last processed + 1
                currentFrom = rows[rows.length - 1].id + 1;
                await sleep(100);
              }
            } else {
              // desc
              let currentTo = from;
              while (currentTo >= to) {
                const { rows } = await client.query(`SELECT * FROM video_mappings WHERE id <= $1 AND id >= $2 ${processAllRecords ? '' : "AND (last_updated IS NULL OR last_updated < NOW() - INTERVAL '2 hours')"} ORDER BY id DESC LIMIT $3`, [currentTo, to, BATCH_SIZE]);
                if (!rows || rows.length === 0) break;
                logStatus(`Processing ${rows.length} rows descending for ids ${to}-${currentTo}`);
                for (const entry of rows) {
                  const finalUrl = await fetchMeta(entry);
                  if (finalUrl && entry.url !== finalUrl) {
                    await client.query(`UPDATE video_mappings SET url = $1, last_updated = NOW() WHERE id = $2`, [finalUrl, entry.id]);
                    logStatus(`Updated url for id ${entry.id} (${entry.name})`);
                  } else {
                    await client.query(`UPDATE video_mappings SET last_updated = NOW() WHERE id = $1`, [entry.id]);
                    logStatus(`No url update for id ${entry.id} (${entry.name})`);
                  }
                }
                processedThisCycle += rows.length;
                currentTo = rows[rows.length - 1].id - 1;
                await sleep(100);
              }
            }
          }

          lastUpdateCycle = new Date();
          if (processedThisCycle === 0) {
            logStatus('No mappings needed update this cycle. Sleeping...');
          } else {
            logStatus(`Processed ${processedThisCycle} mappings this cycle.`);
          }

          await sleep(UPDATE_INTERVAL_MS);
        } catch (cycleErr) {
          logStatus(`Error in update cycle: ${cycleErr.message}. Continuing...`);
          await sleep(UPDATE_INTERVAL_MS);
        }
      }
    } catch (err) {
      updaterError = err;
      logStatus('Updater error: ' + err);
    }
  }

  updateM3u8();

  // Minimal HTTP server
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    if (updaterError) {
      res.end('Updater error: ' + updaterError.toString() + '\n' + logBuffer.join('\n'));
      return;
    }
    if (!updaterStarted) {
      res.end('Updater not started.');
      return;
    }
    const kaStatus = keepAlive.getStatus();
    res.end('Updater running. Last update cycle: ' + (lastUpdateCycle ? lastUpdateCycle.toISOString() : 'never') + '\n' + JSON.stringify(kaStatus, null, 2) + '\n' + logBuffer.join('\n'));
  });

  server.listen(PORT, () => {
    logStatus(`Status server listening on port ${PORT}`);
    keepAlive.start();
    logStatus(`🔄 Keep-alive pings started (every ${KEEP_ALIVE_INTERVAL_MS / 1000}s to ${MAIN_SERVER_URLS.length} servers)`);
  });

  process.on('SIGINT', () => {
    logStatus('Process SIGINT received, stopping keep-alive');
    keepAlive.stop();
    process.exit();
  });
  process.on('SIGTERM', () => {
    logStatus('Process SIGTERM received, stopping keep-alive');
    keepAlive.stop();
    process.exit();
  });

  return { server }; // exported for testing
}
