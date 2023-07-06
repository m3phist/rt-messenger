import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const db = redis;
