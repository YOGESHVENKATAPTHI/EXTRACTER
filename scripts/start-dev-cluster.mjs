<<<<<<< HEAD
#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clusterSize = parseInt(process.argv[2]) || 5;
const processes = [];

// Simple port management for development
function generatePortConfig(size) {
  const basePort = 5000;
  const config = {
    mainPort: basePort,
    uploadPorts: [],
    chatPorts: [],
    generalPorts: []
  };

  let currentPort = basePort + 1;
  
  // Allocate ports for each worker type
  for (let i = 0; i < Math.max(1, Math.floor(size / 3)); i++) {
    config.uploadPorts.push(currentPort++);
  }
  
  for (let i = 0; i < Math.max(1, Math.floor(size / 3)); i++) {
    config.chatPorts.push(currentPort++);
  }
  
  for (let i = 0; i < Math.max(1, Math.ceil(size / 3)); i++) {
    config.generalPorts.push(currentPort++);
  }

  return config;
}

// Wait for workers to be ready by checking their health endpoints
async function waitForWorkersReady(portConfig) {
  const allPorts = [
    ...portConfig.uploadPorts,
    ...portConfig.chatPorts,
    ...portConfig.generalPorts
  ];

  const maxWait = 30000; // 30 seconds max
  const checkInterval = 2000; // Check every 2 seconds
  let waited = 0;

  while (waited < maxWait) {
    const checks = allPorts.map(port => checkWorkerHealth(port));
    const results = await Promise.all(checks);
    const readyCount = results.filter(Boolean).length;

    console.log(`📊 Workers ready: ${readyCount}/${allPorts.length}`);

    if (readyCount === allPorts.length) {
      console.log('✅ All workers are ready!');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }

  console.log('⚠️ Timeout waiting for workers, starting main server anyway...');
}

function checkWorkerHealth(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',  // Use IPv4 explicitly
      port: port,
      path: '/api/health',
      method: 'GET',
      timeout: 5000,
      family: 4  // Force IPv4
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function startCluster() {
  console.log(`🌐 Starting development cluster with ${clusterSize} servers...`);

  try {
    // Generate port assignments for the cluster
    const portConfig = generatePortConfig(clusterSize);
    
    console.log(`📍 Port assignments:`);
    console.log(`  Main server: ${portConfig.mainPort}`);
    console.log(`  Upload workers: ${portConfig.uploadPorts.join(', ')}`);
    console.log(`  Chat workers: ${portConfig.chatPorts.join(', ')}`);
    console.log(`  General workers: ${portConfig.generalPorts.join(', ')}`);

    // Set environment variables for worker discovery
    const env = {
      ...process.env,
      UPLOAD_WORKERS: portConfig.uploadPorts.map(p => `http://127.0.0.1:${p}`).join(','),
      CHAT_WORKERS: portConfig.chatPorts.map(p => `http://127.0.0.1:${p}`).join(','),
      WORKER_SERVERS: portConfig.generalPorts.map(p => `http://127.0.0.1:${p}`).join(','),
      NODE_ENV: 'development',
    };

    // Start upload workers
    for (const port of portConfig.uploadPorts) {
      const process = spawn('npx', [
        'tsx',
        path.join(__dirname, 'start-worker.ts'),
        'upload',
        port.toString()
      ], {
        env,
        stdio: 'inherit',
        shell: true
      });

      process.on('error', (error) => {
        console.error(`❌ Upload worker on port ${port} failed:`, error);
      });

      processes.push({ process, type: 'upload', port });
    }

    // Start chat workers  
    for (const port of portConfig.chatPorts) {
      const process = spawn('npx', [
        'tsx',
        path.join(__dirname, 'start-worker.ts'),
        'chat',
        port.toString()
      ], {
        env,
        stdio: 'inherit',
        shell: true
      });

      process.on('error', (error) => {
        console.error(`❌ Chat worker on port ${port} failed:`, error);
      });

      processes.push({ process, type: 'chat', port });
    }

    // Start general workers
    for (const port of portConfig.generalPorts) {
      const process = spawn('npx', [
        'tsx',
        path.join(__dirname, 'start-worker.ts'),
        'general',
        port.toString()
      ], {
        env,
        stdio: 'inherit',
        shell: true
      });

      process.on('error', (error) => {
        console.error(`❌ General worker on port ${port} failed:`, error);
      });

      processes.push({ process, type: 'general', port });
    }

    // Wait for workers to be ready
    console.log('⏳ Waiting for workers to initialize...');
    await waitForWorkersReady(portConfig);

    // Start main server
    const mainProcess = spawn('npm', ['run', 'dev'], {
      env: {
        ...env,
        PORT: portConfig.mainPort.toString(),
      },
      stdio: 'inherit',
      shell: true
    });

    mainProcess.on('error', (error) => {
      console.error('❌ Main server failed:', error);
    });

    processes.push({ process: mainProcess, type: 'main', port: portConfig.mainPort });

    console.log('✅ Development cluster started successfully!');
    console.log(`🌐 Main server: http://localhost:${portConfig.mainPort}`);
    console.log(`📊 Total processes: ${processes.length}`);

  } catch (error) {
    console.error('❌ Failed to start development cluster:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

function cleanup() {
  console.log('🔌 Shutting down development cluster...');
  
  processes.forEach(({ process: proc, type, port }) => {
    console.log(`  Stopping ${type} server on port ${port}...`);
    proc.kill('SIGTERM');
  });
  
  // Force kill after 10 seconds
  setTimeout(() => {
    processes.forEach(({ process: proc }) => {
      proc.kill('SIGKILL');
    });
    process.exit(0);
  }, 10000);
}

=======
#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clusterSize = parseInt(process.argv[2]) || 5;
const processes = [];

// Simple port management for development
function generatePortConfig(size) {
  const basePort = 5000;
  const config = {
    mainPort: basePort,
    uploadPorts: [],
    chatPorts: [],
    generalPorts: []
  };

  let currentPort = basePort + 1;
  
  // Allocate ports for each worker type
  for (let i = 0; i < Math.max(1, Math.floor(size / 3)); i++) {
    config.uploadPorts.push(currentPort++);
  }
  
  for (let i = 0; i < Math.max(1, Math.floor(size / 3)); i++) {
    config.chatPorts.push(currentPort++);
  }
  
  for (let i = 0; i < Math.max(1, Math.ceil(size / 3)); i++) {
    config.generalPorts.push(currentPort++);
  }

  return config;
}

// Wait for workers to be ready by checking their health endpoints
async function waitForWorkersReady(portConfig) {
  const allPorts = [
    ...portConfig.uploadPorts,
    ...portConfig.chatPorts,
    ...portConfig.generalPorts
  ];

  const maxWait = 30000; // 30 seconds max
  const checkInterval = 2000; // Check every 2 seconds
  let waited = 0;

  while (waited < maxWait) {
    const checks = allPorts.map(port => checkWorkerHealth(port));
    const results = await Promise.all(checks);
    const readyCount = results.filter(Boolean).length;

    console.log(`📊 Workers ready: ${readyCount}/${allPorts.length}`);

    if (readyCount === allPorts.length) {
      console.log('✅ All workers are ready!');
      return;
    }

    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }

  console.log('⚠️ Timeout waiting for workers, starting main server anyway...');
}

function checkWorkerHealth(port) {
  return new Promise((resolve) => {
    const req = http.request({
      hostname: '127.0.0.1',  // Use IPv4 explicitly
      port: port,
      path: '/api/health',
      method: 'GET',
      timeout: 5000,
      family: 4  // Force IPv4
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    
    req.end();
  });
}

async function startCluster() {
  console.log(`🌐 Starting development cluster with ${clusterSize} servers...`);

  try {
    // Generate port assignments for the cluster
    const portConfig = generatePortConfig(clusterSize);
    
    console.log(`📍 Port assignments:`);
    console.log(`  Main server: ${portConfig.mainPort}`);
    console.log(`  Upload workers: ${portConfig.uploadPorts.join(', ')}`);
    console.log(`  Chat workers: ${portConfig.chatPorts.join(', ')}`);
    console.log(`  General workers: ${portConfig.generalPorts.join(', ')}`);

    // Set environment variables for worker discovery
    const env = {
      ...process.env,
      UPLOAD_WORKERS: portConfig.uploadPorts.map(p => `http://127.0.0.1:${p}`).join(','),
      CHAT_WORKERS: portConfig.chatPorts.map(p => `http://127.0.0.1:${p}`).join(','),
      WORKER_SERVERS: portConfig.generalPorts.map(p => `http://127.0.0.1:${p}`).join(','),
      NODE_ENV: 'development',
    };

    // Start upload workers
    for (const port of portConfig.uploadPorts) {
      const process = spawn('npx', [
        'tsx',
        path.join(__dirname, 'start-worker.ts'),
        'upload',
        port.toString()
      ], {
        env,
        stdio: 'inherit',
        shell: true
      });

      process.on('error', (error) => {
        console.error(`❌ Upload worker on port ${port} failed:`, error);
      });

      processes.push({ process, type: 'upload', port });
    }

    // Start chat workers  
    for (const port of portConfig.chatPorts) {
      const process = spawn('npx', [
        'tsx',
        path.join(__dirname, 'start-worker.ts'),
        'chat',
        port.toString()
      ], {
        env,
        stdio: 'inherit',
        shell: true
      });

      process.on('error', (error) => {
        console.error(`❌ Chat worker on port ${port} failed:`, error);
      });

      processes.push({ process, type: 'chat', port });
    }

    // Start general workers
    for (const port of portConfig.generalPorts) {
      const process = spawn('npx', [
        'tsx',
        path.join(__dirname, 'start-worker.ts'),
        'general',
        port.toString()
      ], {
        env,
        stdio: 'inherit',
        shell: true
      });

      process.on('error', (error) => {
        console.error(`❌ General worker on port ${port} failed:`, error);
      });

      processes.push({ process, type: 'general', port });
    }

    // Wait for workers to be ready
    console.log('⏳ Waiting for workers to initialize...');
    await waitForWorkersReady(portConfig);

    // Start main server
    const mainProcess = spawn('npm', ['run', 'dev'], {
      env: {
        ...env,
        PORT: portConfig.mainPort.toString(),
      },
      stdio: 'inherit',
      shell: true
    });

    mainProcess.on('error', (error) => {
      console.error('❌ Main server failed:', error);
    });

    processes.push({ process: mainProcess, type: 'main', port: portConfig.mainPort });

    console.log('✅ Development cluster started successfully!');
    console.log(`🌐 Main server: http://localhost:${portConfig.mainPort}`);
    console.log(`📊 Total processes: ${processes.length}`);

  } catch (error) {
    console.error('❌ Failed to start development cluster:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

function cleanup() {
  console.log('🔌 Shutting down development cluster...');
  
  processes.forEach(({ process: proc, type, port }) => {
    console.log(`  Stopping ${type} server on port ${port}...`);
    proc.kill('SIGTERM');
  });
  
  // Force kill after 10 seconds
  setTimeout(() => {
    processes.forEach(({ process: proc }) => {
      proc.kill('SIGKILL');
    });
    process.exit(0);
  }, 10000);
}

>>>>>>> 39b7011 (Initial commit)
startCluster();