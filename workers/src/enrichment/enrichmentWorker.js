/**
 * Provider Enrichment Worker
 * Enriches provider data from multiple healthcare directories
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { query } = require('../../backend/src/db/connection');
const logger = require('../../backend/src/utils/logger');

/**
 * Main enrichment pipeline for a provider
 */
async function enrichProvider(npi) {
  logger.info(`Enriching provider NPI: ${npi}`);
  
  const provider = await query(
    'SELECT * FROM providers WHERE npi = $1',
    [npi]
  );

  if (!provider.rows.length) {
    logger.warn(`Provider not found for enrichment: ${npi}`);
    return null;
  }

  const p = provider.rows[0];
  const enrichmentData = {};
  const sources = [];

  // Run enrichment tasks in parallel where safe
  const results = await Promise.allSettled([
    enrichFromMedicalBoards(p, npi),
    enrichFromNPIProfile(npi),
    enrichHospitalAffiliations(p),
  ]);

  // Merge results
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      Object.assign(enrichmentData, result.value.data);
      if (result.value.source) sources.push(result.value.source);
    }
  }

  // Calculate data quality score
  const qualityScore = calculateDataQuality({ ...p, ...enrichmentData });

  // Update provider
  await query(`
    UPDATE providers SET
      email = COALESCE($2, email),
      website = COALESCE($3, website),
      education = COALESCE($4::jsonb, education),
      residency = COALESCE($5::jsonb, residency),
      board_certifications = COALESCE($6, board_certifications),
      hospital_affiliations = COALESCE($7, hospital_affiliations),
      accepting_patients = COALESCE($8, accepting_patients),
      enriched_at = NOW(),
      enrichment_sources = $9,
      data_quality_score = $10,
      updated_at = NOW()
    WHERE npi = $1
  `, [
    npi,
    enrichmentData.email,
    enrichmentData.website,
    enrichmentData.education ? JSON.stringify(enrichmentData.education) : null,
    enrichmentData.residency ? JSON.stringify(enrichmentData.residency) : null,
    enrichmentData.boardCertifications,
    enrichmentData.hospitalAffiliations,
    enrichmentData.acceptingPatients,
    sources,
    qualityScore,
  ]);

  // Update scrape job
  await query(`
    UPDATE scrape_jobs SET
      status = 'completed',
      completed_at = NOW(),
      result = $2
    WHERE provider_npi = $1 AND status = 'processing'
  `, [npi, JSON.stringify({ sources, qualityScore, enrichedFields: Object.keys(enrichmentData) })]);

  logger.info(`Enrichment complete for NPI ${npi}: score=${qualityScore} sources=${sources.join(',')}`);
  return { npi, qualityScore, sources };
}

/**
 * Enrich from state medical board data (DOCFINDER style lookup)
 */
async function enrichFromMedicalBoards(provider, npi) {
  try {
    // Real implementation would call state medical board APIs
    // Many states have open APIs or public data exports
    // This demonstrates the pattern

    const stateApis = {
      CA: 'https://www.mbc.ca.gov/api/physician',
      NY: 'https://www.nysed.gov/api/license',
      TX: 'https://www.tmb.state.tx.us/api',
      FL: 'https://ww10.doh.state.fl.us/pub/llweb/api',
    };

    const stateApi = stateApis[provider.state];
    if (!stateApi) return null;

    // Simulate board data enrichment
    // In production, parse actual API responses
    return {
      source: `medical_board_${provider.state}`,
      data: {
        // Board certification data would come from here
      },
    };
  } catch (error) {
    logger.debug(`Medical board enrichment error for ${npi}:`, error.message);
    return null;
  }
}

/**
 * Enhanced NPI Registry fetch for additional data points
 */
async function enrichFromNPIProfile(npi) {
  try {
    const response = await axios.get(
      `https://npiregistry.cms.hhs.gov/api/?number=${npi}&version=2.1`,
      { timeout: 10000 }
    );

    const results = response.data?.results;
    if (!results?.length) return null;

    const p = results[0];
    const basic = p.basic || {};
    const otherAddresses = p.addresses || [];
    const endpoints = p.endpoints || [];

    // Extract website from endpoints if available
    const websiteEndpoint = endpoints.find(e => e.endpoint_type === 'WEBSITE');

    // Get mailing address
    const mailingAddr = otherAddresses.find(a => a.address_purpose === 'MAILING');

    return {
      source: 'npi_registry_enhanced',
      data: {
        website: websiteEndpoint?.endpoint,
        mailingCity: mailingAddr?.city,
        mailingState: mailingAddr?.state,
        npiDeactivationDate: basic.deactivation_date,
        npiReactivationDate: basic.reactivation_date,
      },
    };
  } catch (error) {
    logger.debug(`NPI enhanced fetch error for ${npi}:`, error.message);
    return null;
  }
}

/**
 * Detect hospital affiliations from public hospital directories
 */
async function enrichHospitalAffiliations(provider) {
  try {
    // Query CMS Hospital Compare data or similar
    // In production: query against a pre-built hospital affiliation database
    // derived from CMS data, hospital websites, etc.
    
    // Simulate based on zip code matching
    if (!provider.zip) return null;

    return {
      source: 'hospital_affiliations_db',
      data: {
        // hospitalAffiliations: ['Hospital A', 'Hospital B']
      },
    };
  } catch (error) {
    return null;
  }
}

/**
 * Score data completeness/quality 0-1
 */
function calculateDataQuality(provider) {
  const fields = [
    { key: 'first_name', weight: 0.05 },
    { key: 'last_name', weight: 0.05 },
    { key: 'specialty', weight: 0.10 },
    { key: 'credential', weight: 0.08 },
    { key: 'phone', weight: 0.10 },
    { key: 'email', weight: 0.12 },
    { key: 'city', weight: 0.05 },
    { key: 'state', weight: 0.05 },
    { key: 'board_certifications', weight: 0.10 },
    { key: 'hospital_affiliations', weight: 0.10 },
    { key: 'education', weight: 0.10 },
    { key: 'website', weight: 0.10 },
  ];

  let score = 0;
  for (const field of fields) {
    const val = provider[field.key];
    const hasValue = val && (Array.isArray(val) ? val.length > 0 : Object.keys(val || {}).length > 0 || String(val).length > 0);
    if (hasValue) score += field.weight;
  }

  return Math.min(Math.round(score * 100) / 100, 1.0);
}

/**
 * Queue enrichment job via Redis
 */
async function queueEnrichment(npi, priority = 'normal') {
  const { getQueue } = require('./queue');
  const enrichmentQueue = getQueue('enrichment');

  // Check not already queued/processing
  const existing = await query(
    `SELECT id FROM scrape_jobs WHERE provider_npi = $1 AND status IN ('pending','processing')`,
    [npi]
  );

  if (existing.rows.length) {
    logger.debug(`Enrichment already queued for NPI ${npi}`);
    return;
  }

  // Create job record
  await query(
    `INSERT INTO scrape_jobs (job_type, provider_npi, status, payload)
     VALUES ('enrichment', $1, 'pending', $2)`,
    [npi, JSON.stringify({ npi, priority })]
  );

  await enrichmentQueue.add({ npi }, {
    priority: priority === 'high' ? 1 : 5,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });

  logger.info(`Enrichment queued for NPI ${npi}`);
}

module.exports = {
  enrichProvider,
  queueEnrichment,
  calculateDataQuality,
};
