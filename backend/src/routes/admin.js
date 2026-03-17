/**
 * Admin Routes - Integrations Management
 */
const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const router = express.Router();

// ─── LIST INTEGRATIONS ────────────────────────────────────────
router.get('/integrations', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, provider, is_active, last_tested, test_status, created_at,
              (credentials->>'email') as email_hint
       FROM org_integrations WHERE org_id = $1`,
      [req.orgId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

// ─── SAVE INTEGRATION ─────────────────────────────────────────
router.post('/integrations', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const { provider, credentials } = req.body;

    // In production: encrypt credentials before storing
    // const encrypted = await encryptCredentials(credentials);

    await query(
      `INSERT INTO org_integrations (org_id, provider, credentials, is_active, created_by)
       VALUES ($1, $2, $3, TRUE, $4)
       ON CONFLICT (org_id, provider) DO UPDATE SET
         credentials = $3, is_active = TRUE, updated_at = NOW()`,
      [req.orgId, provider, JSON.stringify(credentials), req.user.id]
    );

    await query(
      `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description)
       VALUES ($1,$2,'integration',NULL,'connected',$3)`,
      [req.orgId, req.user.id, `Connected ${provider} integration`]
    );

    res.json({ success: true, provider });
  } catch (error) {
    logger.error('Save integration error:', error);
    res.status(500).json({ error: 'Failed to save integration' });
  }
});

// ─── TEST INTEGRATION ─────────────────────────────────────────
router.post('/integrations/:provider/test', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const { provider } = req.params;
    let testResult = { success: false, message: '' };

    const result = await query(
      'SELECT credentials FROM org_integrations WHERE org_id = $1 AND provider = $2 AND is_active = TRUE',
      [req.orgId, provider]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    const creds = result.rows[0].credentials;

    switch (provider) {
      case 'gmail':
        testResult = await testGmail(creds);
        break;
      case 'dialpad':
        testResult = await testDialpad(creds);
        break;
      case 'twilio':
        testResult = await testTwilio(creds);
        break;
      default:
        testResult = { success: true, message: 'Connection test not available for this provider' };
    }

    await query(
      `UPDATE org_integrations SET last_tested = NOW(), test_status = $3 WHERE org_id = $1 AND provider = $2`,
      [req.orgId, provider, testResult.success ? 'ok' : 'failed']
    );

    res.json(testResult);
  } catch (error) {
    res.status(500).json({ error: 'Test failed', message: error.message });
  }
});

// ─── DELETE INTEGRATION ───────────────────────────────────────
router.delete('/integrations/:provider', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    await query(
      `UPDATE org_integrations SET is_active = FALSE WHERE org_id = $1 AND provider = $2`,
      [req.orgId, req.params.provider]
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect' });
  }
});

// ─── ORG SETTINGS ─────────────────────────────────────────────
router.get('/settings', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const result = await query('SELECT * FROM organizations WHERE id = $1', [req.orgId]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const org = result.rows[0];
    res.json({ name: org.name, slug: org.slug, plan: org.plan, settings: org.settings, logoUrl: org.logo_url });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.patch('/settings', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const { name, settings } = req.body;
    const result = await query(
      `UPDATE organizations SET name = COALESCE($2, name), settings = COALESCE($3::jsonb, settings) WHERE id = $1 RETURNING *`,
      [req.orgId, name, settings ? JSON.stringify(settings) : null]
    );
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ─── USER MANAGEMENT ──────────────────────────────────────────
router.get('/users', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role, is_active, last_login_at, created_at
       FROM users WHERE org_id = $1 ORDER BY created_at DESC`,
      [req.orgId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.post('/users/invite', requireOrgAccess, requireRole('ORG_ADMIN'), async (req, res) => {
  try {
    const { email, firstName, lastName, role = 'RECRUITER' } = req.body;
    const bcrypt = require('bcrypt');
    const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
    const hash = await bcrypt.hash(tempPassword, 12);

    await query(
      `INSERT INTO users (org_id, email, password_hash, first_name, last_name, role)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.orgId, email.toLowerCase(), hash, firstName, lastName, role]
    );

    // TODO: Send welcome email with temp password
    res.json({ success: true, tempPassword }); // Don't return in production
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// ─── TEST HELPERS ─────────────────────────────────────────────
async function testGmail(creds) {
  try {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
    oauth2Client.setCredentials({ access_token: creds.accessToken, refresh_token: creds.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return { success: true, message: `Connected as ${profile.data.emailAddress}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function testDialpad(creds) {
  try {
    const axios = require('axios');
    const response = await axios.get('https://dialpad.com/api/v2/users/me', {
      headers: { Authorization: `Bearer ${creds.apiKey}` },
    });
    return { success: true, message: `Connected as ${response.data.email}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

async function testTwilio(creds) {
  try {
    const twilio = require('twilio')(creds.accountSid, creds.authToken);
    const account = await twilio.api.accounts(creds.accountSid).fetch();
    return { success: true, message: `Connected: ${account.friendlyName}` };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = router;
