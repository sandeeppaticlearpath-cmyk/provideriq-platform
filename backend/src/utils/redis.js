const Redis = require('ioredis');
let client;
async function connectRedis() {
  client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  await client.ping();
  return client;
}
function getRedis() { return client; }
module.exports = { connectRedis, getRedis };
