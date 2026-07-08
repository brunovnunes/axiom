import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { routes } from './routes.js';
import { initDb } from '../database/db.js';
import { getConfig } from '../config/config.js';
import { mkdir } from 'node:fs/promises';

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    },
  },
});

async function start() {
  try {
    const config = getConfig();

    // Ensure base workspace directory exists
    await mkdir(config.workspace, { recursive: true });

    // Initialize database
    initDb();
    fastify.log.info('Database initialized successfully.');

    // Register plugins
    await fastify.register(cors, {
      origin: true, // Allow all origins for the local API
    });
    
    // Limits applied: 50MB file size max for now
    await fastify.register(multipart, {
      limits: {
        fileSize: 50 * 1024 * 1024, 
      }
    });

    // Register routes
    await fastify.register(routes, { prefix: '/api' });

    // Start server
    const port = 3000;
    await fastify.listen({ port, host: '0.0.0.0' });
    
    fastify.log.info(`Axiom Printer Agent API running on http://localhost:${port}/api`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    fastify.log.info(`Received ${signal}, shutting down...`);
    await fastify.close();
    process.exit(0);
  });
});

start();
