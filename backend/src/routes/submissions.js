const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', requireOrgAccess, async (req, res) => {
  try {
    const { status, candidateId, jobId, limit = 50, offset = 0 } = req.query;
    const conditions = ['s.org_id = $1'];
    const params = [req.orgId];
    let idx = 2;

    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }
    if (candidateId) { conditions.push(`s.candidate_id = $${idx++}`); params.push(candidateId); }
    if (jobId) { conditions.push(`s.job_id = $${idx++}`); params.push(jobId); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await query(
      `SELECT s.*, c.first_name, c.last_name, j.title as job_title, j.location_city, j.location_state,
              u.first_name as submitted_by_first, u.last_name as submitted_by_last
       FROM submissions s
       JOIN candidates c ON c.id = s.candidate_id
       JOIN jobs j ON j.id = s.job_id
       LEFT JOIN users u ON u.id = s.submitted_by
       ${where}
       ORDER BY s.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit, 10), parseInt(offset, 10)]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('List submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

router.post('/', requireOrgAccess, requireRole('RECRUITER'), async (req, res) => {
  try {
    const { candidateId, jobId, status = 'submitted', aiMatchScore, notes } = req.body;

    if (!candidateId || !jobId) {
      return res.status(400).json({ error: 'candidateId and jobId are required' });
    }

    const result = await query(
      `INSERT INTO submissions (org_id, candidate_id, job_id, submitted_by, status, ai_match_score, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [req.orgId, candidateId, jobId, req.user.id, status, aiMatchScore || null, notes || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create submission error:', error);
    res.status(500).json({ error: 'Failed to create submission' });
  }
});

module.exports = router;
