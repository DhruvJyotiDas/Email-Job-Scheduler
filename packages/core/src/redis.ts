import IORedis from 'ioredis';
import { config } from './config';

/** BullMQ requires maxRetriesPerRequest=null on its connections. */
export const createRedis = () => new IORedis(config.redisUrl, { maxRetriesPerRequest: null });
export const redis = createRedis();
export const EVENTS_CHANNEL = 'email-events';
