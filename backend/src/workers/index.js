const Bull = require('bull');
const logger = require('../utils/logger');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const queues = new Map();

function getQueue(name = 'default') {
  if (!queues.has(name)) {
    queues.set(name, new Bull(name, REDIS_URL));
  }
  return queues.get(name);
}

async function queueEnrichment(npi, extra = {}) {
  const queue = getQueue('enrichment');
  return queue.add({ npi, ...extra }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: true,
    removeOnFail: 50,
  });
}

async function setupWorkers() {
  const enrichmentQueue = getQueue('enrichment');
  enrichmentQueue.process(5, async (job) => {
    const workerModule = require('../../workers/src/enrichment/enrichmentWorker');
    const enrichProvider = workerModule.enrichProvider || workerModule.default;

    if (typeof enrichProvider !== 'function') {
      throw new Error('enrichProvider worker is not available');
    }

    return enrichProvider(job.data.npi, job.data);
  });

  enrichmentQueue.on('failed', (job, err) => {
    logger.error(`Enrichment failed NPI ${job?.data?.npi}: ${err.message}`);
  });

  logger.info('Workers initialized');
}

module.exports = {
  getQueue,
  queueEnrichment,
  setupWorkers,
};
