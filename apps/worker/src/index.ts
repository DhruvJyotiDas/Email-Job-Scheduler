import { Worker } from 'bullmq';
import { QUEUE_NAME, SendEmailJobData } from '@ejs/shared';
import { config, createRedis, ensureIndex, logger, prisma, redis } from '@ejs/core';
import { processEmail } from './processor';

async function main() {
  await ensureIndex().catch((err) => logger.warn({ err }, 'ES not ready; search indexing will retry per email'));

  const worker = new Worker<SendEmailJobData>(QUEUE_NAME, (job, token) => processEmail(job, token), {
    connection: createRedis(),
    concurrency: config.workerConcurrency,
  });

  worker.on('completed', (job) => logger.info({ jobId: job.id }, 'job completed'));
  worker.on('failed', (job, err) => logger.warn({ jobId: job?.id, err: err.message }, 'job failed'));
  worker.on('error', (err) => logger.error({ err }, 'worker error'));
  logger.info({ concurrency: config.workerConcurrency }, 'worker started');

  // Graceful shutdown: stop taking new jobs, let in-flight ones finish, then close connections.
  let closing = false;
  const shutdown = async (sig: string) => {
    if (closing) return;
    closing = true;
    logger.info({ sig }, 'shutting down: draining in-flight jobs');
    try {
      await worker.close();
      await prisma.$disconnect();
      redis.disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker crashed');
  process.exit(1);
});
