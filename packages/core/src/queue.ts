import { Queue } from 'bullmq';
import { QUEUE_NAME, SendEmailJobData } from '@ejs/shared';
import { createRedis } from './redis';

export const emailQueue = new Queue<SendEmailJobData>(QUEUE_NAME, {
  connection: createRedis(),
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 86400, count: 5000 },
    removeOnFail: false,
  },
});
