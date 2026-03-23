const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role, title, phone, avatar_url, is_active, last_login_at, created_at
       FROM users
       WHERE org_id = $1
       ORDER BY created_at DESC`,
      [req.orgId]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('List users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/me', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, role, title, phone, avatar_url, preferences, last_login_at
       FROM users
       WHERE id = $1 AND org_id = $2`,
      [req.user.id, req.orgId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get user profile error:', error);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

module.exports = router;
