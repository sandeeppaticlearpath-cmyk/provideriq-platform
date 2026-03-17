/**
 * Communications Routes
 * Email, Call, SMS via integrated providers
 * Full activity tracking with flags and notes
 */

const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess, requireRole } = require('../middleware/auth');
const { getIntegration, logCommunication } = require('../integrations/communicationsService');
const logger = require('../utils/logger');
const router = express.Router();

// ─── SEND EMAIL ───────────────────────────────────────────────
router.post('/email', requireOrgAccess, async (req, res) => {
  try {
    const { candidateId, to, subject, body, provider = 'gmail', threadId } = req.body;

    if (!to || !subject || !body) {
      return res.status(400).json({ error: 'to, subject, and body are required' });
    }

    const integration = await getIntegration(req.orgId, provider);
    const result = await integration.sendEmail({
      to, subject, body, threadId,
      fromName: `${req.user.firstName} ${req.user.lastName}`,
      candidateId, userId: req.user.id, orgId: req.orgId,
    });

    res.json({ success: true, messageId: result.id, provider });
  } catch (error) {
    if (error.message.includes('not configured')) {
      return res.status(400).json({ error: error.message, code: 'INTEGRATION_NOT_CONFIGURED' });
    }
    logger.error('Send email error:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// ─── INITIATE CALL ─────────────────────────────────────────────
router.post('/call', requireOrgAccess, async (req, res) => {
  try {
    const { candidateId, toNumber, provider = 'dialpad' } = req.body;

    if (!toNumber) return res.status(400).json({ error: 'toNumber required' });

    const integration = await getIntegration(req.orgId, provider);
    const result = await integration.initiateCall({
      toNumber, candidateId, userId: req.user.id, orgId: req.orgId,
    });

    res.json({ success: true, ...result, provider });
  } catch (error) {
    if (error.message.includes('not configured')) {
      return res.status(400).json({ error: error.message, code: 'INTEGRATION_NOT_CONFIGURED' });
    }
    logger.error('Initiate call error:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// ─── SEND SMS ──────────────────────────────────────────────────
router.post('/sms', requireOrgAccess, async (req, res) => {
  try {
    const { candidateId, toNumber, message, provider = 'twilio' } = req.body;

    if (!toNumber || !message) return res.status(400).json({ error: 'toNumber and message required' });

    const integration = await getIntegration(req.orgId, provider);
    const result = await integration.sendSMS({
      toNumber, message, candidateId, userId: req.user.id, orgId: req.orgId,
    });

    res.json({ success: true, messageId: result.sid || result.id, provider });
  } catch (error) {
    if (error.message.includes('not configured')) {
      return res.status(400).json({ error: error.message, code: 'INTEGRATION_NOT_CONFIGURED' });
    }
    logger.error('Send SMS error:', error);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// ─── SCHEDULE TEAMS MEETING ───────────────────────────────────
router.post('/teams-meeting', requireOrgAccess, async (req, res) => {
  try {
    const { candidateId, attendeeEmail, subject, startTime, endTime } = req.body;

    const integration = await getIntegration(req.orgId, 'outlook');
    const result = await integration.scheduleTeamsMeeting({
      attendeeEmail, subject, startTime, endTime,
      candidateId, userId: req.user.id, orgId: req.orgId,
    });

    res.json({ success: true, meetingUrl: result.meetingUrl });
  } catch (error) {
    logger.error('Teams meeting error:', error);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

// ─── LOG MANUAL COMMUNICATION ─────────────────────────────────
router.post('/log', requireOrgAccess, async (req, res) => {
  try {
    const {
      candidateId, channel, direction = 'outbound', subject, body,
      durationSec, outcome, notes, callFlag,
    } = req.body;

    const commId = await logCommunication({
      orgId: req.orgId, userId: req.user.id, candidateId,
      channel, direction, subject, body,
      status: outcome || 'completed',
      durationSec,
      metadata: { notes, manual: true, callFlag },
    });

    // Update candidate flag if provided
    if (callFlag && candidateId) {
      await query(
        `UPDATE candidates SET
           contact_flag = $3,
           custom_fields = custom_fields || jsonb_build_object('lastCallFlag', $3, 'lastCallNotes', $4)
         WHERE id = $1 AND org_id = $2`,
        [candidateId, req.orgId, callFlag, notes]
      );
    }

    res.json({ success: true, communicationId: commId });
  } catch (error) {
    logger.error('Log communication error:', error);
    res.status(500).json({ error: 'Failed to log communication' });
  }
});

// ─── GET COMMUNICATIONS FOR CANDIDATE ────────────────────────
router.get('/candidate/:candidateId', requireOrgAccess, async (req, res) => {
  try {
    const { limit = 50, offset = 0, channel } = req.query;

    const conditions = ['c.org_id = $1', 'c.candidate_id = $2'];
    const params = [req.orgId, req.params.candidateId];
    let idx = 3;

    if (channel) { conditions.push(`c.channel = $${idx++}`); params.push(channel); }

    const result = await query(
      `SELECT c.*,
              u.first_name as user_first, u.last_name as user_last, u.avatar_url as user_avatar
       FROM communications c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, parseInt(limit), parseInt(offset)]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('Get communications error:', error);
    res.status(500).json({ error: 'Failed to fetch communications' });
  }
});

// ─── UPDATE CALL RECORD (add summary, notes, flag) ────────────
router.patch('/:id', requireOrgAccess, async (req, res) => {
  try {
    const { summary, notes, callFlag, durationSec, recordingUrl, status } = req.body;

    const result = await query(
      `UPDATE communications SET
         status = COALESCE($3, status),
         duration_sec = COALESCE($4, duration_sec),
         recording_url = COALESCE($5, recording_url),
         metadata = metadata || jsonb_build_object(
           'summary', $6,
           'notes', $7,
           'callFlag', $8,
           'updatedAt', NOW()::text
         )
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [req.params.id, req.orgId, status, durationSec, recordingUrl, summary, notes, callFlag]
    );

    if (!result.rows.length) return res.status(404).json({ error: 'Communication not found' });

    // Update candidate flag
    if (callFlag) {
      const comm = result.rows[0];
      if (comm.candidate_id) {
        await query(
          `UPDATE candidates SET contact_flag = $1 WHERE id = $2 AND org_id = $3`,
          [callFlag, comm.candidate_id, req.orgId]
        );
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update communication error:', error);
    res.status(500).json({ error: 'Failed to update communication' });
  }
});

// ─── COMMUNICATIONS DASHBOARD ─────────────────────────────────
router.get('/dashboard', requireOrgAccess, async (req, res) => {
  try {
    const { userId, period = '7d' } = req.query;
    const days = { '1d': 1, '7d': 7, '30d': 30 }[period] || 7;

    const conditions = ['c.org_id = $1', `c.created_at > NOW() - INTERVAL '${days} days'`];
    const params = [req.orgId];

    if (userId) { conditions.push('c.user_id = $2'); params.push(userId); }
    // If not admin, show only own comms
    else if (!['ORG_ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(req.user.role)) {
      conditions.push('c.user_id = $2'); params.push(req.user.id);
    }

    const [stats, recent, byChannel, byUser] = await Promise.all([
      query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE channel = 'email') as emails,
           COUNT(*) FILTER (WHERE channel = 'call') as calls,
           COUNT(*) FILTER (WHERE channel = 'sms') as sms,
           COUNT(*) FILTER (WHERE status = 'replied') as replies,
           AVG(duration_sec) FILTER (WHERE channel = 'call') as avg_call_duration
         FROM communications c
         WHERE ${conditions.join(' AND ')}`,
        params
      ),
      query(
        `SELECT c.*,
                cand.first_name as cand_first, cand.last_name as cand_last,
                u.first_name as user_first, u.last_name as user_last
         FROM communications c
         LEFT JOIN candidates cand ON cand.id = c.candidate_id
         LEFT JOIN users u ON u.id = c.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY c.created_at DESC LIMIT 20`,
        params
      ),
      query(
        `SELECT channel, COUNT(*) as count
         FROM communications c
         WHERE ${conditions.join(' AND ')}
         GROUP BY channel`,
        params
      ),
      query(
        `SELECT u.id, u.first_name, u.last_name,
                COUNT(*) as total_comms,
                COUNT(*) FILTER (WHERE c.channel = 'call') as calls,
                COUNT(*) FILTER (WHERE c.channel = 'email') as emails
         FROM communications c
         JOIN users u ON u.id = c.user_id
         WHERE ${conditions.join(' AND ')}
         GROUP BY u.id, u.first_name, u.last_name
         ORDER BY total_comms DESC`,
        params
      ),
    ]);

    res.json({
      stats: stats.rows[0],
      recentCommunications: recent.rows,
      byChannel: byChannel.rows,
      byUser: byUser.rows,
    });
  } catch (error) {
    logger.error('Comms dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch comms dashboard' });
  }
});

// ─── DIALPAD WEBHOOK ──────────────────────────────────────────
router.post('/webhooks/dialpad', async (req, res) => {
  try {
    const { DialpadIntegration } = require('../integrations/communicationsService');
    // No org context needed for webhooks - use external_id to find record
    const { event, call_id, duration, recording_url } = req.body;

    if (event === 'call.ended') {
      await query(
        `UPDATE communications SET
           status = 'completed', duration_sec = $2, recording_url = $3
         WHERE external_id = $1`,
        [call_id, duration, recording_url]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    logger.error('Dialpad webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ─── GMAIL OAUTH CALLBACK ─────────────────────────────────────
router.get('/oauth/gmail/callback', async (req, res) => {
  try {
    const { code, state } = req.query; // state = orgId:userId
    const [orgId, userId] = state.split(':');

    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      `${process.env.BACKEND_URL}/api/communications/oauth/gmail/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);
    const userInfo = await oauth2Client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GMAIL_CLIENT_ID }).catch(() => null);
    const email = userInfo?.getPayload()?.email;

    // Store credentials
    await query(
      `INSERT INTO org_integrations (org_id, provider, credentials, is_active, created_by)
       VALUES ($1, 'gmail', $2, TRUE, $3)
       ON CONFLICT (org_id, provider) DO UPDATE SET credentials = $2, is_active = TRUE`,
      [orgId, JSON.stringify({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        email,
        clientId: process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
      }), userId]
    );

    res.redirect(`${process.env.FRONTEND_URL}/admin/integrations?connected=gmail`);
  } catch (error) {
    logger.error('Gmail OAuth error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/admin/integrations?error=gmail_oauth_failed`);
  }
});

module.exports = router;
