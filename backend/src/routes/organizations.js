const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/me', requireOrgAccess, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, name, slug, status, plan, seats_limit, logo_url, settings, created_at, updated_at
       FROM organizations
       WHERE id = $1`,
      [req.orgId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Get organization error:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

module.exports = router;
