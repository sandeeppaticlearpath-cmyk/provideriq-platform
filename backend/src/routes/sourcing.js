/**
 * Sourcing Routes - Deep Provider Search
 * Supports: NPI, Name, LinkedIn URL, Doximity URL, Google
 */

const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

// ─── UNIFIED DEEP SEARCH ──────────────────────────────────────
router.post('/search', requireOrgAccess, async (req, res) => {
  try {
    const {
      searchType,  // 'npi' | 'name' | 'linkedin' | 'doximity' | 'smart'
      query: searchQuery,
      firstName, lastName, specialty, state, city,
      linkedinUrl, doximityUrl,
      deepScrape = false,
    } = req.body;

    let results = [];
    let scrapeQueued = false;

    switch (searchType) {
      case 'npi':
        results = await searchByNPI(searchQuery.trim());
        break;

      case 'name':
        results = await searchByName({ firstName, lastName, specialty, state, city });
        if (deepScrape && results.length > 0) {
          await queueDeepScrape(results[0].npi, { firstName, lastName, specialty, state });
          scrapeQueued = true;
        }
        break;

      case 'linkedin':
        results = await searchByLinkedIn(linkedinUrl, req.orgId);
        scrapeQueued = true;
        break;

      case 'doximity':
        results = await searchByDoximity(doximityUrl, req.orgId);
        scrapeQueued = true;
        break;

      case 'smart':
        // Auto-detect input type and search all sources
        results = await smartSearch(searchQuery, { specialty, state, city }, deepScrape);
        scrapeQueued = deepScrape;
        break;
    }

    // Check which results are already in this org's pipeline
    if (results.length) {
      const npiList = results.map(r => r.npi).filter(Boolean);
      if (npiList.length) {
        const existing = await query(
          `SELECT p.npi, c.id as candidate_id, c.pipeline_stage
           FROM candidates c
           JOIN providers p ON p.id = c.provider_id
           WHERE c.org_id = $1 AND p.npi = ANY($2)`,
          [req.orgId, npiList]
        );
        const existingMap = {};
        existing.rows.forEach(r => { existingMap[r.npi] = r; });
        results = results.map(r => ({
          ...r,
          inPipeline: !!existingMap[r.npi],
          candidateId: existingMap[r.npi]?.candidate_id,
          pipelineStage: existingMap[r.npi]?.pipeline_stage,
        }));
      }
    }

    res.json({ results, scrapeQueued, total: results.length });
  } catch (error) {
    logger.error('Sourcing search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── DEEP SCRAPE A SPECIFIC PROVIDER ─────────────────────────
router.post('/deep-scrape', requireOrgAccess, async (req, res) => {
  try {
    const { npi, linkedinUrl, doximityUrl, providerName, specialty, state } = req.body;

    // Queue the deep enrichment job
    const { getQueue } = require('../workers');
    const queue = getQueue('deep-enrichment');

    const jobData = { npi, linkedinUrl, doximityUrl, providerName, specialty, state };
    const job = await queue.add(jobData, {
      priority: 1,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    // Create scrape job record
    await query(
      `INSERT INTO scrape_jobs (job_type, provider_npi, status, payload)
       VALUES ('deep_enrichment', $1, 'queued', $2)
       ON CONFLICT DO NOTHING`,
      [npi, JSON.stringify(jobData)]
    );

    res.json({ jobId: job.id, message: 'Deep enrichment queued. Results will update automatically.' });
  } catch (error) {
    logger.error('Deep scrape queue error:', error);
    res.status(500).json({ error: 'Failed to queue enrichment' });
  }
});

// ─── REAL-TIME SCRAPE STATUS ──────────────────────────────────
router.get('/scrape-status/:npi', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT status, result, error, created_at, completed_at
       FROM scrape_jobs
       WHERE provider_npi = $1
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.npi]
    );
    res.json(result.rows[0] || { status: 'not_started' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get scrape status' });
  }
});

// ─── BATCH IMPORT ─────────────────────────────────────────────
router.post('/batch-import', requireOrgAccess, async (req, res) => {
  try {
    const { providers, source = 'import' } = req.body;
    // providers: [{ npi?, firstName, lastName, specialty, state, linkedinUrl, doximityUrl }]

    if (!Array.isArray(providers) || !providers.length) {
      return res.status(400).json({ error: 'providers array required' });
    }

    const jobs = [];
    for (const p of providers.slice(0, 100)) { // Cap at 100 per batch
      jobs.push(queueDeepScrape(p.npi, p));
    }

    await Promise.allSettled(jobs);
    res.json({ message: `${jobs.length} providers queued for enrichment` });
  } catch (error) {
    logger.error('Batch import error:', error);
    res.status(500).json({ error: 'Batch import failed' });
  }
});

// ─── SEARCH HELPERS ───────────────────────────────────────────
async function searchByNPI(npi) {
  // Check local DB first
  const local = await query(
    `SELECT * FROM providers WHERE npi = $1`,
    [npi]
  );
  if (local.rows.length) return local.rows;

  // Fetch from NPI registry live
  const axios = require('axios');
  try {
    const response = await axios.get(
      `https://npiregistry.cms.hhs.gov/api/?number=${npi}&version=2.1`,
      { timeout: 8000 }
    );
    const results = response.data?.results || [];
    return results.map(formatNPIResult);
  } catch {
    return [];
  }
}

async function searchByName({ firstName, lastName, specialty, state, city }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (firstName) { conditions.push(`first_name ILIKE $${idx++}`); params.push(`${firstName}%`); }
  if (lastName) { conditions.push(`last_name ILIKE $${idx++}`); params.push(`${lastName}%`); }
  if (specialty) { conditions.push(`specialty ILIKE $${idx++}`); params.push(`%${specialty}%`); }
  if (state) { conditions.push(`state = $${idx++}`); params.push(state.toUpperCase()); }
  if (city) { conditions.push(`city ILIKE $${idx++}`); params.push(`%${city}%`); }

  if (!conditions.length) return [];

  const result = await query(
    `SELECT id, npi, first_name, last_name, credential, specialty, taxonomy_code,
            city, state, phone, email, practice_name, hospital_affiliations,
            board_certifications, data_quality_score, enriched_at, linkedin_url, doximity_url
     FROM providers
     WHERE ${conditions.join(' AND ')}
     ORDER BY data_quality_score DESC LIMIT 50`,
    params
  );
  return result.rows;
}

async function searchByLinkedIn(linkedinUrl, orgId) {
  if (!linkedinUrl) return [];

  // Check if already in DB
  const existing = await query(
    `SELECT * FROM providers WHERE linkedin_url = $1`,
    [linkedinUrl]
  );
  if (existing.rows.length) return existing.rows;

  // Queue scrape and return placeholder
  await queueDeepScrape(null, { linkedinUrl });

  return [{
    id: null,
    npi: null,
    linkedinUrl,
    enrichmentStatus: 'queued',
    message: 'Extracting profile data from LinkedIn. Results will appear shortly.',
  }];
}

async function searchByDoximity(doximityUrl, orgId) {
  if (!doximityUrl) return [];

  const existing = await query(
    `SELECT * FROM providers WHERE doximity_url = $1`,
    [doximityUrl]
  );
  if (existing.rows.length) return existing.rows;

  await queueDeepScrape(null, { doximityUrl });

  return [{
    id: null,
    npi: null,
    doximityUrl,
    enrichmentStatus: 'queued',
    message: 'Extracting profile from Doximity. Results will appear shortly.',
  }];
}

async function smartSearch(input, filters, deepScrape) {
  // Auto-detect input type
  if (/^\d{10}$/.test(input?.trim())) {
    return searchByNPI(input.trim());
  }

  if (input?.includes('linkedin.com/in/')) {
    return searchByLinkedIn(input, null);
  }

  if (input?.includes('doximity.com/')) {
    return searchByDoximity(input, null);
  }

  // Treat as name search
  const parts = input?.split(' ') || [];
  return searchByName({
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
    ...filters,
  });
}

async function queueDeepScrape(npi, data) {
  try {
    const Bull = require('bull');
    const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
    const deepQueue = new Bull('deep-enrichment', REDIS_URL);
    await deepQueue.add({ npi, ...data }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
  } catch (err) {
    logger.debug(`Queue error: ${err.message}`);
  }
}

function formatNPIResult(p) {
  const basic = p.basic || {};
  const addr = p.addresses?.[0] || {};
  const taxonomy = p.taxonomies?.[0] || {};
  return {
    npi: p.number,
    firstName: basic.first_name,
    lastName: basic.last_name,
    credential: basic.credential,
    specialty: taxonomy.desc,
    city: addr.city,
    state: addr.state,
    phone: addr.telephone_number,
    source: 'npi_registry_live',
  };
}

module.exports = router;
