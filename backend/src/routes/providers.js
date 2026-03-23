/**
 * Provider Routes
 * Global healthcare provider database + NPI search
 */

const express = require('express');
const { query } = require('../db/connection');
const { requireRole, requireOrgAccess } = require('../middleware/auth');
const { queueEnrichment } = require('../workers');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Search Global Provider DB ────────────────────────────────
router.get('/search', requireOrgAccess, async (req, res) => {
  try {
    const {
      q,
      specialty,
      state,
      city,
      taxonomy,
      credential,
      boardCertified,
      limit = 25,
      offset = 0,
    } = req.query;

    const conditions = [];
    const params = [];
    let paramIdx = 1;

    if (q) {
      conditions.push(`(
        to_tsvector('english', coalesce(first_name,'') || ' ' || last_name || ' ' || coalesce(specialty,'')) 
        @@ plainto_tsquery('english', $${paramIdx})
        OR npi ILIKE $${paramIdx + 1}
      )`);
      params.push(q, `%${q}%`);
      paramIdx += 2;
    }

    if (specialty) {
      conditions.push(`specialty ILIKE $${paramIdx}`);
      params.push(`%${specialty}%`);
      paramIdx++;
    }

    if (state) {
      conditions.push(`state = $${paramIdx}`);
      params.push(state.toUpperCase());
      paramIdx++;
    }

    if (city) {
      conditions.push(`city ILIKE $${paramIdx}`);
      params.push(`%${city}%`);
      paramIdx++;
    }

    if (taxonomy) {
      conditions.push(`taxonomy_code ILIKE $${paramIdx}`);
      params.push(`%${taxonomy}%`);
      paramIdx++;
    }

    if (credential) {
      conditions.push(`credential ILIKE $${paramIdx}`);
      params.push(`%${credential}%`);
      paramIdx++;
    }

    if (boardCertified === 'true') {
      conditions.push(`array_length(board_certifications, 1) > 0`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      query(`SELECT COUNT(*) FROM providers ${whereClause}`, params),
      query(
        `SELECT id, npi, first_name, last_name, credential, specialty, taxonomy_code,
                practice_name, city, state, phone, email, hospital_affiliations,
                board_certifications, data_quality_score, enriched_at
         FROM providers ${whereClause}
         ORDER BY data_quality_score DESC, last_name ASC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
    ]);

    res.json({
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
      providers: dataResult.rows,
    });
  } catch (error) {
    logger.error('Provider search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ─── Get Provider by NPI ──────────────────────────────────────
router.get('/npi/:npi', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, 
              json_agg(DISTINCT jsonb_build_object(
                'state', pl.state, 'licenseNumber', pl.license_number,
                'status', pl.status, 'expirationDate', pl.expiration_date
              )) FILTER (WHERE pl.id IS NOT NULL) as licenses
       FROM providers p
       LEFT JOIN provider_licenses pl ON pl.provider_id = p.id
       WHERE p.npi = $1
       GROUP BY p.id`,
      [req.params.npi]
    );

    if (!result.rows.length) {
      // Try to fetch from NPI registry
      const npiData = await fetchFromNPIRegistry(req.params.npi);
      if (!npiData) {
        return res.status(404).json({ error: 'Provider not found' });
      }
      return res.json(npiData);
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get provider by NPI error:', error);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
});

// ─── Get Provider Detail ──────────────────────────────────────
router.get('/:id', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*,
              json_agg(DISTINCT jsonb_build_object(
                'id', pl.id, 'state', pl.state, 'licenseNumber', pl.license_number,
                'licenseType', pl.license_type, 'status', pl.status,
                'expirationDate', pl.expiration_date, 'verifiedAt', pl.verified_at
              )) FILTER (WHERE pl.id IS NOT NULL) as licenses
       FROM providers p
       LEFT JOIN provider_licenses pl ON pl.provider_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    // Check if candidate exists in this org
    const candidateResult = await query(
      `SELECT id, pipeline_stage FROM candidates WHERE provider_id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );

    const provider = result.rows[0];
    provider.candidateInfo = candidateResult.rows[0] || null;

    res.json(provider);
  } catch (error) {
    logger.error('Get provider detail error:', error);
    res.status(500).json({ error: 'Failed to fetch provider' });
  }
});

// ─── Add to Candidate Pipeline ────────────────────────────────
router.post('/:id/add-to-pipeline', requireOrgAccess, async (req, res) => {
  try {
    const { stage = 'sourced', assignedTo, notes } = req.body;

    // Get provider
    const provResult = await query('SELECT * FROM providers WHERE id = $1', [req.params.id]);
    if (!provResult.rows.length) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    const provider = provResult.rows[0];

    // Check if already a candidate
    const existing = await query(
      'SELECT id FROM candidates WHERE provider_id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );

    if (existing.rows.length) {
      return res.status(409).json({
        error: 'Provider already in pipeline',
        candidateId: existing.rows[0].id,
      });
    }

    // Create candidate
    const candidate = await query(
      `INSERT INTO candidates (
        org_id, provider_id, first_name, last_name, email, phone,
        specialty, credential, state, city, pipeline_stage, source, assigned_to, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        req.orgId, provider.id, provider.first_name, provider.last_name,
        provider.email, provider.phone, provider.specialty, provider.credential,
        provider.state, provider.city, stage, 'provider_db',
        assignedTo || req.user.id, req.user.id,
      ]
    );

    // Log activity
    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description)
       VALUES ($1,$2,'candidate',$3,'created','Added provider to pipeline from global database')`,
      [req.orgId, req.user.id, candidate.rows[0].id]
    );

    if (notes) {
      await query(
        `INSERT INTO candidate_notes (candidate_id, org_id, author_id, content, note_type)
         VALUES ($1,$2,$3,$4,'system')`,
        [candidate.rows[0].id, req.orgId, req.user.id, notes]
      );
    }

    // Emit real-time update
    req.app.get('io')?.to(`org:${req.orgId}`).emit('candidate:created', {
      candidateId: candidate.rows[0].id,
      stage,
    });

    res.status(201).json(candidate.rows[0]);
  } catch (error) {
    logger.error('Add to pipeline error:', error);
    res.status(500).json({ error: 'Failed to add provider to pipeline' });
  }
});

// ─── Trigger Enrichment ───────────────────────────────────────
router.post('/:id/enrich', requireOrgAccess, requireRole('MANAGER'), async (req, res) => {
  try {
    const result = await query('SELECT npi FROM providers WHERE id = $1', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Provider not found' });
    }

    await queueEnrichment(result.rows[0].npi);
    res.json({ message: 'Enrichment queued successfully' });
  } catch (error) {
    logger.error('Queue enrichment error:', error);
    res.status(500).json({ error: 'Failed to queue enrichment' });
  }
});

// ─── Specialties List (for filters) ──────────────────────────
router.get('/meta/specialties', async (req, res) => {
  try {
    const result = await query(
      `SELECT specialty, COUNT(*) as count
       FROM providers
       WHERE specialty IS NOT NULL
       GROUP BY specialty
       ORDER BY count DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch specialties' });
  }
});

// ─── States List ──────────────────────────────────────────────
router.get('/meta/states', async (req, res) => {
  try {
    const result = await query(
      `SELECT state, COUNT(*) as count
       FROM providers
       WHERE state IS NOT NULL
       GROUP BY state
       ORDER BY state ASC`
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch states' });
  }
});

// Helper: Fetch from NPI Registry API
async function fetchFromNPIRegistry(npi) {
  const axios = require('axios');
  try {
    const response = await axios.get(
      `https://npiregistry.cms.hhs.gov/api/?number=${npi}&version=2.1`,
      { timeout: 5000 }
    );
    const results = response.data?.results;
    if (!results?.length) return null;

    const p = results[0];
    const basic = p.basic || {};
    const addr = p.addresses?.[0] || {};
    const taxonomy = p.taxonomies?.[0] || {};

    return {
      npi: p.number,
      firstName: basic.first_name,
      lastName: basic.last_name,
      credential: basic.credential,
      gender: basic.gender,
      specialty: taxonomy.desc,
      taxonomyCode: taxonomy.code,
      city: addr.city,
      state: addr.state,
      phone: addr.telephone_number,
      practiceAddress: addr.address_1,
      npiStatus: basic.status,
      source: 'npi_registry_live',
    };
  } catch {
    return null;
  }
}

module.exports = router;
