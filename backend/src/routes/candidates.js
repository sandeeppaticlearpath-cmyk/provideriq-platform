/**
 * Candidate Routes - Full ATS Pipeline
 */

const express = require('express');
const { query } = require('../db/connection');
const { requireRole, requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const VALID_STAGES = ['sourced', 'contacted', 'interested', 'submitted', 'interview', 'offer', 'placed'];

// ─── List Candidates ──────────────────────────────────────────
router.get('/', requireOrgAccess, async (req, res) => {
  try {
    const {
      stage, specialty, state, assignedTo, q,
      limit = 50, offset = 0, sortBy = 'updated_at', sortDir = 'DESC'
    } = req.query;

    const conditions = ['c.org_id = $1'];
    const params = [req.orgId];
    let idx = 2;

    if (stage) { conditions.push(`c.pipeline_stage = $${idx++}`); params.push(stage); }
    if (specialty) { conditions.push(`c.specialty ILIKE $${idx++}`); params.push(`%${specialty}%`); }
    if (state) { conditions.push(`c.state = $${idx++}`); params.push(state.toUpperCase()); }
    if (assignedTo) { conditions.push(`c.assigned_to = $${idx++}`); params.push(assignedTo); }
    if (q) {
      conditions.push(`(c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    const allowed = ['updated_at', 'created_at', 'last_contacted_at', 'last_name'];
    const safeSort = allowed.includes(sortBy) ? sortBy : 'updated_at';
    const safeDir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM candidates c ${where}`, params),
      query(
        `SELECT c.*, 
                u.first_name as assignee_first, u.last_name as assignee_last,
                p.npi, p.taxonomy_code
         FROM candidates c
         LEFT JOIN users u ON u.id = c.assigned_to
         LEFT JOIN providers p ON p.id = c.provider_id
         ${where}
         ORDER BY c.${safeSort} ${safeDir}
         LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, parseInt(limit), parseInt(offset)]
      ),
    ]);

    res.json({
      total: parseInt(countRes.rows[0].count),
      candidates: dataRes.rows,
    });
  } catch (error) {
    logger.error('List candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// ─── Kanban Pipeline ──────────────────────────────────────────
router.get('/pipeline', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         pipeline_stage,
         COUNT(*) as count,
         json_agg(json_build_object(
           'id', c.id,
           'firstName', c.first_name,
           'lastName', c.last_name,
           'specialty', c.specialty,
           'state', c.state,
           'credential', c.credential,
           'assigneeFirst', u.first_name,
           'assigneeLast', u.last_name,
           'lastContactedAt', c.last_contacted_at,
           'updatedAt', c.updated_at,
           'tags', c.tags
         ) ORDER BY c.updated_at DESC) as candidates
       FROM candidates c
       LEFT JOIN users u ON u.id = c.assigned_to
       WHERE c.org_id = $1
       GROUP BY pipeline_stage`,
      [req.orgId]
    );

    // Build ordered pipeline
    const pipeline = VALID_STAGES.map(stage => {
      const found = result.rows.find(r => r.pipeline_stage === stage);
      return {
        stage,
        count: found ? parseInt(found.count) : 0,
        candidates: found ? found.candidates : [],
      };
    });

    res.json(pipeline);
  } catch (error) {
    logger.error('Pipeline error:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline' });
  }
});

// ─── Get Candidate ────────────────────────────────────────────
router.get('/:id', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*,
              u.first_name as assignee_first, u.last_name as assignee_last, u.email as assignee_email,
              p.npi, p.taxonomy_code, p.hospital_affiliations, p.education,
              p.residency, p.board_certifications, p.enriched_at
       FROM candidates c
       LEFT JOIN users u ON u.id = c.assigned_to
       LEFT JOIN providers p ON p.id = c.provider_id
       WHERE c.id = $1 AND c.org_id = $2`,
      [req.params.id, req.orgId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    // Fetch recent notes
    const notes = await query(
      `SELECT cn.*, u.first_name as author_first, u.last_name as author_last, u.avatar_url as author_avatar
       FROM candidate_notes cn
       JOIN users u ON u.id = cn.author_id
       WHERE cn.candidate_id = $1
       ORDER BY cn.is_pinned DESC, cn.created_at DESC
       LIMIT 20`,
      [req.params.id]
    );

    // Fetch submissions
    const submissions = await query(
      `SELECT s.*, j.title as job_title, j.location_city, j.location_state
       FROM submissions s
       JOIN jobs j ON j.id = s.job_id
       WHERE s.candidate_id = $1 AND s.org_id = $2
       ORDER BY s.created_at DESC`,
      [req.params.id, req.orgId]
    );

    const candidate = result.rows[0];
    candidate.notes = notes.rows;
    candidate.submissions = submissions.rows;

    res.json(candidate);
  } catch (error) {
    logger.error('Get candidate error:', error);
    res.status(500).json({ error: 'Failed to fetch candidate' });
  }
});

// ─── Create Candidate ─────────────────────────────────────────
router.post('/', requireOrgAccess, async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone, specialty, credential,
      state, city, pipelineStage = 'sourced', source = 'manual',
      assignedTo, tags, resumeUrl, linkedinUrl, availabilityDate,
      desiredSalary, salaryType, willingToRelocate, notes,
    } = req.body;

    if (!lastName) {
      return res.status(400).json({ error: 'Last name required' });
    }

    const result = await query(
      `INSERT INTO candidates (
        org_id, first_name, last_name, email, phone, specialty, credential,
        state, city, pipeline_stage, source, assigned_to, tags, resume_url,
        linkedin_url, availability_date, desired_salary, salary_type,
        willing_to_relocate, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        req.orgId, firstName, lastName, email, phone, specialty, credential,
        state, city, pipelineStage, source, assignedTo || req.user.id,
        tags || [], resumeUrl, linkedinUrl, availabilityDate,
        desiredSalary, salaryType, willingToRelocate || false, req.user.id,
      ]
    );

    const candidate = result.rows[0];

    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description)
       VALUES ($1,$2,'candidate',$3,'created','Candidate manually created')`,
      [req.orgId, req.user.id, candidate.id]
    );

    if (notes) {
      await query(
        `INSERT INTO candidate_notes (candidate_id, org_id, author_id, content)
         VALUES ($1,$2,$3,$4)`,
        [candidate.id, req.orgId, req.user.id, notes]
      );
    }

    req.app.get('io')?.to(`org:${req.orgId}`).emit('candidate:created', { candidateId: candidate.id });

    res.status(201).json(candidate);
  } catch (error) {
    logger.error('Create candidate error:', error);
    res.status(500).json({ error: 'Failed to create candidate' });
  }
});

// ─── Update Candidate ─────────────────────────────────────────
router.patch('/:id', requireOrgAccess, async (req, res) => {
  try {
    // Get current state
    const current = await query(
      'SELECT * FROM candidates WHERE id = $1 AND org_id = $2',
      [req.params.id, req.orgId]
    );
    if (!current.rows.length) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const {
      firstName, lastName, email, phone, specialty, credential,
      state, city, pipelineStage, assignedTo, tags, resumeUrl,
      linkedinUrl, availabilityDate, desiredSalary, salaryType,
      willingToRelocate, doNotContact,
    } = req.body;

    const result = await query(
      `UPDATE candidates SET
        first_name = COALESCE($3, first_name),
        last_name = COALESCE($4, last_name),
        email = COALESCE($5, email),
        phone = COALESCE($6, phone),
        specialty = COALESCE($7, specialty),
        credential = COALESCE($8, credential),
        state = COALESCE($9, state),
        city = COALESCE($10, city),
        pipeline_stage = COALESCE($11, pipeline_stage),
        assigned_to = COALESCE($12, assigned_to),
        tags = COALESCE($13, tags),
        resume_url = COALESCE($14, resume_url),
        linkedin_url = COALESCE($15, linkedin_url),
        availability_date = COALESCE($16, availability_date),
        desired_salary = COALESCE($17, desired_salary),
        salary_type = COALESCE($18, salary_type),
        willing_to_relocate = COALESCE($19, willing_to_relocate),
        do_not_contact = COALESCE($20, do_not_contact)
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [
        req.params.id, req.orgId, firstName, lastName, email, phone,
        specialty, credential, state, city, pipelineStage, assignedTo,
        tags, resumeUrl, linkedinUrl, availabilityDate, desiredSalary,
        salaryType, willingToRelocate, doNotContact,
      ]
    );

    // Log stage change
    if (pipelineStage && pipelineStage !== current.rows[0].pipeline_stage) {
      await query(
        `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description, metadata)
         VALUES ($1,$2,'candidate',$3,'stage_changed',$4,$5)`,
        [
          req.orgId, req.user.id, req.params.id,
          `Stage changed from ${current.rows[0].pipeline_stage} to ${pipelineStage}`,
          JSON.stringify({ from: current.rows[0].pipeline_stage, to: pipelineStage }),
        ]
      );
    }

    req.app.get('io')?.to(`org:${req.orgId}`).emit('candidate:updated', {
      candidateId: req.params.id,
      changes: req.body,
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update candidate error:', error);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// ─── Move Pipeline Stage ──────────────────────────────────────
router.patch('/:id/stage', requireOrgAccess, async (req, res) => {
  try {
    const { stage } = req.body;

    if (!VALID_STAGES.includes(stage)) {
      return res.status(400).json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}` });
    }

    const result = await query(
      `UPDATE candidates SET pipeline_stage = $3 WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.orgId, stage]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description)
       VALUES ($1,$2,'candidate',$3,'stage_changed',$4)`,
      [req.orgId, req.user.id, req.params.id, `Moved to ${stage}`]
    );

    req.app.get('io')?.to(`org:${req.orgId}`).emit('candidate:stage_changed', {
      candidateId: req.params.id, stage,
    });

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Stage update error:', error);
    res.status(500).json({ error: 'Failed to update stage' });
  }
});

// ─── Add Note ─────────────────────────────────────────────────
router.post('/:id/notes', requireOrgAccess, async (req, res) => {
  try {
    const { content, noteType = 'general', isPinned = false } = req.body;

    if (!content?.trim()) {
      return res.status(400).json({ error: 'Note content required' });
    }

    const result = await query(
      `INSERT INTO candidate_notes (candidate_id, org_id, author_id, content, note_type, is_pinned)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *, (SELECT row_to_json(u) FROM (
         SELECT first_name, last_name, avatar_url FROM users WHERE id = $3
       ) u) as author`,
      [req.params.id, req.orgId, req.user.id, content, noteType, isPinned]
    );

    await query(
      `UPDATE candidates SET last_contacted_at = NOW() WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Add note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// ─── Delete Candidate ─────────────────────────────────────────
router.delete('/:id', requireOrgAccess, requireRole('MANAGER'), async (req, res) => {
  try {
    const result = await query(
      'DELETE FROM candidates WHERE id = $1 AND org_id = $2 RETURNING id',
      [req.params.id, req.orgId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description)
       VALUES ($1,$2,'candidate',$3,'deleted','Candidate record deleted')`,
      [req.orgId, req.user.id, req.params.id]
    );

    res.json({ message: 'Candidate deleted' });
  } catch (error) {
    logger.error('Delete candidate error:', error);
    res.status(500).json({ error: 'Failed to delete candidate' });
  }
});

module.exports = router;
