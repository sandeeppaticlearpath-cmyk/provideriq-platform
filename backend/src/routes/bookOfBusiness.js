/**
 * Book of Business (BoB) Routes
 * Personal pipeline management per recruiter
 * Own candidates, contacts, deals, revenue tracking
 */

const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

const CONTACT_FLAGS = [
  'active', 'prospects', 'not_responding', 'dormant',
  'pending', 'booked', 'placed', 'on_hold', 'do_not_contact', 'warm_lead', 'hot_lead',
];

// ─── MY BOOK OF BUSINESS OVERVIEW ────────────────────────────
router.get('/overview', requireOrgAccess, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    // Only managers+ can view others' BoB
    const targetUserId = (['MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(req.user.role))
      ? userId : req.user.id;

    const [
      summary,
      byFlag,
      byStage,
      recentActivity,
      placements,
      topCandidates,
    ] = await Promise.all([
      // Summary counts
      query(`
        SELECT
          COUNT(*) as total_candidates,
          COUNT(*) FILTER (WHERE pipeline_stage = 'placed') as placements,
          COUNT(*) FILTER (WHERE pipeline_stage IN ('offer','placed')) as near_close,
          COUNT(*) FILTER (WHERE last_contacted_at > NOW() - INTERVAL '7 days') as contacted_this_week,
          COUNT(*) FILTER (WHERE last_contacted_at < NOW() - INTERVAL '30 days' OR last_contacted_at IS NULL) as needs_followup,
          SUM(CASE WHEN pipeline_stage = 'placed' THEN desired_salary ELSE 0 END) as placed_value
        FROM candidates
        WHERE org_id = $1 AND assigned_to = $2
      `, [req.orgId, targetUserId]),

      // Candidates by flag
      query(`
        SELECT contact_flag, COUNT(*) as count
        FROM candidates
        WHERE org_id = $1 AND assigned_to = $2 AND contact_flag IS NOT NULL
        GROUP BY contact_flag
        ORDER BY count DESC
      `, [req.orgId, targetUserId]),

      // Pipeline stage breakdown
      query(`
        SELECT pipeline_stage, COUNT(*) as count
        FROM candidates
        WHERE org_id = $1 AND assigned_to = $2
        GROUP BY pipeline_stage
      `, [req.orgId, targetUserId]),

      // Recent activity on their candidates
      query(`
        SELECT al.*, c.first_name as cand_first, c.last_name as cand_last
        FROM activity_logs al
        LEFT JOIN candidates c ON c.id = al.entity_id
        WHERE al.org_id = $1 AND al.user_id = $2
        ORDER BY al.created_at DESC LIMIT 15
      `, [req.orgId, targetUserId]),

      // Recent placements
      query(`
        SELECT s.*, j.title as job_title, j.facility_name,
               c.first_name, c.last_name, c.specialty
        FROM submissions s
        JOIN jobs j ON j.id = s.job_id
        JOIN candidates c ON c.id = s.candidate_id
        WHERE s.org_id = $1 AND s.submitted_by = $2 AND s.status = 'offer_accepted'
        ORDER BY s.placement_date DESC LIMIT 10
      `, [req.orgId, targetUserId]),

      // Top candidates by engagement
      query(`
        SELECT c.*, 
               COUNT(al.id) as activity_count_30d
        FROM candidates c
        LEFT JOIN activity_logs al ON al.entity_id = c.id
          AND al.created_at > NOW() - INTERVAL '30 days'
        WHERE c.org_id = $1 AND c.assigned_to = $2
        GROUP BY c.id
        ORDER BY activity_count_30d DESC, c.updated_at DESC
        LIMIT 10
      `, [req.orgId, targetUserId]),
    ]);

    res.json({
      summary: summary.rows[0],
      byFlag: byFlag.rows,
      byStage: byStage.rows,
      recentActivity: recentActivity.rows,
      placements: placements.rows,
      topCandidates: topCandidates.rows,
    });
  } catch (error) {
    logger.error('BoB overview error:', error);
    res.status(500).json({ error: 'Failed to fetch Book of Business' });
  }
});

// ─── MY CANDIDATES (filtered + flagged) ──────────────────────
router.get('/candidates', requireOrgAccess, async (req, res) => {
  try {
    const {
      flag, stage, specialty, state, q,
      sortBy = 'updated_at', sortDir = 'DESC',
      limit = 50, offset = 0,
    } = req.query;

    const conditions = ['c.org_id = $1', 'c.assigned_to = $2'];
    const params = [req.orgId, req.user.id];
    let idx = 3;

    if (flag) { conditions.push(`c.contact_flag = $${idx++}`); params.push(flag); }
    if (stage) { conditions.push(`c.pipeline_stage = $${idx++}`); params.push(stage); }
    if (specialty) { conditions.push(`c.specialty ILIKE $${idx++}`); params.push(`%${specialty}%`); }
    if (state) { conditions.push(`c.state = $${idx++}`); params.push(state); }
    if (q) {
      conditions.push(`(c.first_name ILIKE $${idx} OR c.last_name ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${q}%`);
      idx++;
    }

    const safeSort = ['updated_at', 'created_at', 'last_contacted_at', 'last_name'].includes(sortBy) ? sortBy : 'updated_at';
    const safeDir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM candidates c WHERE ${conditions.join(' AND ')}`, params),
      query(
        `SELECT c.*,
                COUNT(cn.id) OVER (PARTITION BY c.id) as note_count,
                COUNT(comm.id) OVER (PARTITION BY c.id) as comm_count,
                MAX(comm.created_at) OVER (PARTITION BY c.id) as last_comm_at
         FROM candidates c
         LEFT JOIN candidate_notes cn ON cn.candidate_id = c.id
         LEFT JOIN communications comm ON comm.candidate_id = c.id AND comm.org_id = c.org_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY c.id
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
    logger.error('BoB candidates error:', error);
    res.status(500).json({ error: 'Failed to fetch candidates' });
  }
});

// ─── FLAG A CANDIDATE ─────────────────────────────────────────
router.patch('/candidates/:id/flag', requireOrgAccess, async (req, res) => {
  try {
    const { flag, notes } = req.body;

    if (!CONTACT_FLAGS.includes(flag)) {
      return res.status(400).json({
        error: `Invalid flag. Must be one of: ${CONTACT_FLAGS.join(', ')}`
      });
    }

    const result = await query(
      `UPDATE candidates SET
         contact_flag = $3,
         custom_fields = custom_fields || jsonb_build_object(
           'flagNotes', $4,
           'flaggedAt', NOW()::text,
           'flaggedBy', $5::text
         )
       WHERE id = $1 AND org_id = $2 AND assigned_to = $6
       RETURNING *`,
      [req.params.id, req.orgId, flag, notes || '', req.user.id, req.user.id]
    );

    if (!result.rows.length) {
      // Allow managers to flag any candidate
      if (['MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
        const r2 = await query(
          `UPDATE candidates SET contact_flag = $3 WHERE id = $1 AND org_id = $2 RETURNING *`,
          [req.params.id, req.orgId, flag]
        );
        if (!r2.rows.length) return res.status(404).json({ error: 'Candidate not found' });
        return res.json(r2.rows[0]);
      }
      return res.status(404).json({ error: 'Candidate not found or not assigned to you' });
    }

    // Log activity
    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description, metadata)
       VALUES ($1,$2,'candidate',$3,'flag_updated',$4,$5)`,
      [req.orgId, req.user.id, req.params.id,
       `Flag set to: ${flag}`, JSON.stringify({ flag, notes })]
    );

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Flag candidate error:', error);
    res.status(500).json({ error: 'Failed to update flag' });
  }
});

// ─── ADD BoB NOTE ─────────────────────────────────────────────
router.post('/candidates/:id/notes', requireOrgAccess, async (req, res) => {
  try {
    const { content, noteType = 'general', isPinned = false, callFlag } = req.body;

    if (!content?.trim()) return res.status(400).json({ error: 'Content required' });

    const result = await query(
      `INSERT INTO candidate_notes (candidate_id, org_id, author_id, content, note_type, is_pinned)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *, (
         SELECT row_to_json(u) FROM (
           SELECT id, first_name, last_name, avatar_url FROM users WHERE id = $3
         ) u
       ) as author`,
      [req.params.id, req.orgId, req.user.id, content, noteType, isPinned]
    );

    // Optionally update flag at same time
    if (callFlag) {
      await query(
        `UPDATE candidates SET contact_flag = $1 WHERE id = $2 AND org_id = $3`,
        [callFlag, req.params.id, req.orgId]
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Add BoB note error:', error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// ─── TRANSFER CANDIDATE ───────────────────────────────────────
router.post('/candidates/:id/transfer', requireOrgAccess, async (req, res) => {
  try {
    const { toUserId, notes } = req.body;

    if (!['MANAGER', 'ORG_ADMIN', 'SUPER_ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only managers can transfer candidates' });
    }

    const result = await query(
      `UPDATE candidates SET assigned_to = $3 WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.orgId, toUserId]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Candidate not found' });

    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description)
       VALUES ($1,$2,'candidate',$3,'transferred',$4)`,
      [req.orgId, req.user.id, req.params.id,
       `Transferred to new recruiter. ${notes || ''}`]
    );

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to transfer candidate' });
  }
});

// ─── BoB STATS FOR USER ───────────────────────────────────────
router.get('/stats', requireOrgAccess, async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;

    const result = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE contact_flag = 'active') as active,
        COUNT(*) FILTER (WHERE contact_flag = 'hot_lead') as hot_leads,
        COUNT(*) FILTER (WHERE contact_flag = 'warm_lead') as warm_leads,
        COUNT(*) FILTER (WHERE contact_flag = 'prospects') as prospects,
        COUNT(*) FILTER (WHERE contact_flag = 'not_responding') as not_responding,
        COUNT(*) FILTER (WHERE contact_flag = 'dormant') as dormant,
        COUNT(*) FILTER (WHERE contact_flag = 'pending') as pending,
        COUNT(*) FILTER (WHERE contact_flag = 'booked') as booked,
        COUNT(*) FILTER (WHERE contact_flag = 'placed') as placed_flag,
        COUNT(*) FILTER (WHERE contact_flag = 'on_hold') as on_hold,
        COUNT(*) FILTER (WHERE pipeline_stage = 'placed') as pipeline_placed,
        COUNT(*) FILTER (WHERE last_contacted_at IS NULL) as never_contacted,
        COUNT(*) FILTER (WHERE last_contacted_at < NOW() - INTERVAL '14 days') as stale
      FROM candidates
      WHERE org_id = $1 AND assigned_to = $2
    `, [req.orgId, userId]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── FOLLOW-UP REMINDERS ──────────────────────────────────────
router.get('/followups', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(`
      SELECT c.*,
             MAX(comm.created_at) as last_comm,
             MAX(cn.created_at) as last_note,
             EXTRACT(EPOCH FROM (NOW() - GREATEST(
               MAX(comm.created_at), MAX(cn.created_at), c.created_at
             ))) / 86400 as days_since_contact
      FROM candidates c
      LEFT JOIN communications comm ON comm.candidate_id = c.id AND comm.org_id = c.org_id
      LEFT JOIN candidate_notes cn ON cn.candidate_id = c.id
      WHERE c.org_id = $1 AND c.assigned_to = $2
        AND c.do_not_contact = FALSE
        AND c.pipeline_stage NOT IN ('placed', 'sourced')
        AND c.contact_flag NOT IN ('do_not_contact', 'dormant', 'placed')
      GROUP BY c.id
      HAVING EXTRACT(EPOCH FROM (NOW() - GREATEST(
        MAX(comm.created_at), MAX(cn.created_at), c.created_at
      ))) / 86400 > 7
      ORDER BY days_since_contact DESC
      LIMIT 30
    `, [req.orgId, req.user.id]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch followups' });
  }
});

module.exports = router;
module.exports.CONTACT_FLAGS = CONTACT_FLAGS;
