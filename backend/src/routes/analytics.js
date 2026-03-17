/**
 * Analytics Routes
 * Dashboard metrics, pipeline conversion, recruiter performance
 */

const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// ─── Dashboard Overview ───────────────────────────────────────
router.get('/dashboard', requireOrgAccess, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const orgId = req.orgId;

    const daysMap = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
    const days = daysMap[period] || 30;

    const [
      candidateStats,
      submissionStats,
      pipelineStats,
      recentActivity,
      recruiterPerf,
      timeToFill,
    ] = await Promise.all([
      // Candidate pipeline counts
      query(`
        SELECT pipeline_stage, COUNT(*) as count
        FROM candidates WHERE org_id = $1 GROUP BY pipeline_stage
      `, [orgId]),

      // Submission stats for period
      query(`
        SELECT 
          COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '${days} days') as total_submissions,
          COUNT(*) FILTER (WHERE status = 'offer_accepted' AND created_at > NOW() - INTERVAL '${days} days') as placements,
          COUNT(*) FILTER (WHERE status IN ('interview_scheduled', 'interview_complete') AND created_at > NOW() - INTERVAL '${days} days') as interviews,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected
        FROM submissions WHERE org_id = $1
      `, [orgId]),

      // Pipeline conversion rates
      query(`
        SELECT 
          COUNT(*) FILTER (WHERE pipeline_stage = 'sourced') as sourced,
          COUNT(*) FILTER (WHERE pipeline_stage = 'contacted') as contacted,
          COUNT(*) FILTER (WHERE pipeline_stage = 'interested') as interested,
          COUNT(*) FILTER (WHERE pipeline_stage = 'submitted') as submitted,
          COUNT(*) FILTER (WHERE pipeline_stage = 'interview') as interview,
          COUNT(*) FILTER (WHERE pipeline_stage = 'offer') as offer,
          COUNT(*) FILTER (WHERE pipeline_stage = 'placed') as placed,
          COUNT(*) as total
        FROM candidates WHERE org_id = $1
      `, [orgId]),

      // Recent activity
      query(`
        SELECT al.*, u.first_name, u.last_name, u.avatar_url
        FROM activity_logs al
        LEFT JOIN users u ON u.id = al.user_id
        WHERE al.org_id = $1
        ORDER BY al.created_at DESC LIMIT 10
      `, [orgId]),

      // Recruiter performance
      query(`
        SELECT 
          u.id, u.first_name, u.last_name, u.avatar_url,
          COUNT(DISTINCT c.id) as candidates_owned,
          COUNT(DISTINCT s.id) as submissions,
          COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'offer_accepted') as placements,
          COUNT(DISTINCT al.id) FILTER (WHERE al.created_at > NOW() - INTERVAL '${days} days') as activities
        FROM users u
        LEFT JOIN candidates c ON c.assigned_to = u.id AND c.org_id = $1
        LEFT JOIN submissions s ON s.submitted_by = u.id AND s.org_id = $1
        LEFT JOIN activity_logs al ON al.user_id = u.id AND al.org_id = $1
        WHERE u.org_id = $1 AND u.role IN ('RECRUITER', 'SOURCER', 'MANAGER')
        GROUP BY u.id, u.first_name, u.last_name, u.avatar_url
        ORDER BY placements DESC, submissions DESC
        LIMIT 10
      `, [orgId]),

      // Average time to fill (placed candidates)
      query(`
        SELECT 
          AVG(EXTRACT(EPOCH FROM (s.placement_date - c.created_at)) / 86400)::INTEGER as avg_days_to_fill
        FROM submissions s
        JOIN candidates c ON c.id = s.candidate_id
        WHERE s.org_id = $1 AND s.status = 'offer_accepted' 
          AND s.placement_date IS NOT NULL
          AND s.created_at > NOW() - INTERVAL '${days} days'
      `, [orgId]),
    ]);

    // Build pipeline funnel data
    const pipeline = pipelineStats.rows[0];
    const total = parseInt(pipeline.total) || 1;
    const funnelData = [
      { stage: 'Sourced', count: parseInt(pipeline.sourced), rate: 100 },
      { stage: 'Contacted', count: parseInt(pipeline.contacted), rate: Math.round(pipeline.contacted / total * 100) },
      { stage: 'Interested', count: parseInt(pipeline.interested), rate: Math.round(pipeline.interested / total * 100) },
      { stage: 'Submitted', count: parseInt(pipeline.submitted), rate: Math.round(pipeline.submitted / total * 100) },
      { stage: 'Interview', count: parseInt(pipeline.interview), rate: Math.round(pipeline.interview / total * 100) },
      { stage: 'Offer', count: parseInt(pipeline.offer), rate: Math.round(pipeline.offer / total * 100) },
      { stage: 'Placed', count: parseInt(pipeline.placed), rate: Math.round(pipeline.placed / total * 100) },
    ];

    res.json({
      period,
      summary: {
        totalCandidates: parseInt(pipeline.total),
        submissions: parseInt(submissionStats.rows[0].total_submissions),
        placements: parseInt(submissionStats.rows[0].placements),
        interviews: parseInt(submissionStats.rows[0].interviews),
        avgDaysToFill: parseInt(timeToFill.rows[0].avg_days_to_fill) || 0,
      },
      pipeline: funnelData,
      pipelineByStage: candidateStats.rows,
      recentActivity: recentActivity.rows,
      recruiterPerformance: recruiterPerf.rows,
    });
  } catch (error) {
    logger.error('Analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ─── Submissions Over Time ────────────────────────────────────
router.get('/submissions-trend', requireOrgAccess, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period] || 30;

    const result = await query(`
      SELECT 
        DATE_TRUNC('day', created_at) as date,
        COUNT(*) as submissions,
        COUNT(*) FILTER (WHERE status = 'offer_accepted') as placements
      FROM submissions
      WHERE org_id = $1 AND created_at > NOW() - INTERVAL '${days} days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `, [req.orgId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch trend data' });
  }
});

// ─── Jobs Analytics ───────────────────────────────────────────
router.get('/jobs', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        j.id, j.title, j.specialty, j.location_city, j.location_state,
        j.status, j.created_at,
        COUNT(s.id) as total_submissions,
        COUNT(s.id) FILTER (WHERE s.status = 'offer_accepted') as placements,
        COUNT(s.id) FILTER (WHERE s.status IN ('interview_scheduled','interview_complete')) as interviews,
        AVG(s.ai_match_score) as avg_match_score
      FROM jobs j
      LEFT JOIN submissions s ON s.job_id = j.id AND s.org_id = j.org_id
      WHERE j.org_id = $1
      GROUP BY j.id
      ORDER BY j.created_at DESC
    `, [req.orgId]);

    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch job analytics' });
  }
});

module.exports = router;
