const express = require('express');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

router.get('/', requireOrgAccess, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const result = await query(
      `SELECT al.*, u.first_name, u.last_name, u.avatar_url
       FROM activity_logs al
       LEFT JOIN users u ON u.id = al.user_id
       WHERE al.org_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.orgId, parseInt(limit, 10), parseInt(offset, 10)]
    );

    res.json(result.rows);
  } catch (error) {
    logger.error('List activity error:', error);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

module.exports = router;
