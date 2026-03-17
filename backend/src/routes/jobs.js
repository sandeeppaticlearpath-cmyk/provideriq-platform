const express = require('express');
const { query } = require('../db/connection');
const { requireRole, requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

router.get('/', requireOrgAccess, async (req, res) => {
  try {
    const { status, specialty, limit = 50, offset = 0 } = req.query;
    const conditions = ['j.org_id = $1'];
    const params = [req.orgId];
    let idx = 2;
    if (status) { conditions.push(`j.status = $${idx++}`); params.push(status); }
    if (specialty) { conditions.push(`j.specialty ILIKE $${idx++}`); params.push(`%${specialty}%`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM jobs j ${where}`, params),
      query(`SELECT j.*, u.first_name as owner_first, u.last_name as owner_last
             FROM jobs j LEFT JOIN users u ON u.id = j.owner_id
             ${where} ORDER BY j.created_at DESC LIMIT $${idx} OFFSET $${idx+1}`,
             [...params, parseInt(limit), parseInt(offset)])
    ]);
    res.json({ total: parseInt(countRes.rows[0].count), jobs: dataRes.rows });
  } catch (error) { logger.error('List jobs error:', error); res.status(500).json({ error: 'Failed to fetch jobs' }); }
});

router.post('/', requireOrgAccess, requireRole('RECRUITER'), async (req, res) => {
  try {
    const { title, description, requirements, specialty, jobType, locationCity, locationState, isRemote,
            facilityName, facilityType, salaryMin, salaryMax, salaryType, startDate, priority, clientName, tags } = req.body;
    if (!title) return res.status(400).json({ error: 'Job title required' });
    const result = await query(
      `INSERT INTO jobs (org_id, title, description, requirements, specialty, job_type, location_city, location_state,
        is_remote, facility_name, facility_type, salary_min, salary_max, salary_type, start_date, priority,
        client_name, tags, owner_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19) RETURNING *`,
      [req.orgId, title, description, requirements, specialty, jobType, locationCity, locationState,
       isRemote||false, facilityName, facilityType, salaryMin, salaryMax, salaryType, startDate,
       priority||'normal', clientName, tags||[], req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) { logger.error('Create job error:', error); res.status(500).json({ error: 'Failed to create job' }); }
});

router.get('/:id', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(`SELECT j.*, u.first_name as owner_first, u.last_name as owner_last
      FROM jobs j LEFT JOIN users u ON u.id = j.owner_id WHERE j.id = $1 AND j.org_id = $2`, [req.params.id, req.orgId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to fetch job' }); }
});

router.patch('/:id', requireOrgAccess, async (req, res) => {
  try {
    const { title, description, specialty, status, priority, locationCity, locationState, salaryMin, salaryMax } = req.body;
    const result = await query(
      `UPDATE jobs SET title=COALESCE($3,title), description=COALESCE($4,description), specialty=COALESCE($5,specialty),
        status=COALESCE($6,status), priority=COALESCE($7,priority), location_city=COALESCE($8,location_city),
        location_state=COALESCE($9,location_state), salary_min=COALESCE($10,salary_min), salary_max=COALESCE($11,salary_max)
       WHERE id=$1 AND org_id=$2 RETURNING *`,
      [req.params.id, req.orgId, title, description, specialty, status, priority, locationCity, locationState, salaryMin, salaryMax]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Job not found' });
    res.json(result.rows[0]);
  } catch (error) { res.status(500).json({ error: 'Failed to update job' }); }
});

module.exports = router;
