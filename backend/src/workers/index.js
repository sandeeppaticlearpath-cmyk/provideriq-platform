const Bull = require('bull');
const logger = require('../utils/logger');
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
async function setupWorkers() {
  const enrichmentQueue = new Bull('enrichment', REDIS_URL);
  enrichmentQueue.process(5, async (job) => {
    const { enrichProvider } = require('../../workers/src/enrichment/enrichmentWorker');
    return enrichProvider(job.data.npi);
  });
  enrichmentQueue.on('failed', (job, err) => logger.error(`Enrichment failed NPI ${job.data.npi}: ${err.message}`));
  logger.info('Workers initialized');
}
module.exports = { setupWorkers };
