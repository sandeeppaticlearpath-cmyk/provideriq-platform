/**
 * Authentication & Authorization Middleware
 * JWT verification + Role-Based Access Control
 */

const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// Role hierarchy
const ROLE_HIERARCHY = {
  SUPER_ADMIN: 5,
  ORG_ADMIN: 4,
  MANAGER: 3,
  RECRUITER: 2,
  SOURCER: 1,
};

/**
 * Verify JWT and attach user to request
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    // Fetch fresh user data (catches deactivated accounts)
    const result = await query(
      `SELECT u.*, o.slug as org_slug, o.plan as org_plan, o.status as org_status
       FROM users u
       JOIN organizations o ON o.id = u.org_id
       WHERE u.id = $1 AND u.is_active = TRUE AND o.status = 'active'`,
      [decoded.userId]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'User not found or account inactive' });
    }

    const user = result.rows[0];
    req.user = {
      id: user.id,
      orgId: user.org_id,
      orgSlug: user.org_slug,
      orgPlan: user.org_plan,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    logger.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Authentication error' });
  }
}

/**
 * Require minimum role level
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = Math.max(...roles.map(r => ROLE_HIERARCHY[r] || 0));

    if (userLevel < requiredLevel) {
      logger.warn(`Access denied: user=${req.user.id} role=${req.user.role} required=${roles.join(',')}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Ensure org isolation - user can only access their org's data
 */
function requireOrgAccess(req, res, next) {
  const requestedOrgId = req.params.orgId || req.body.orgId || req.query.orgId;

  if (requestedOrgId && requestedOrgId !== req.user.orgId && req.user.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Cross-organization access denied' });
  }

  // Inject orgId into query for safety
  req.orgId = req.user.role === 'SUPER_ADMIN' && requestedOrgId
    ? requestedOrgId
    : req.user.orgId;

  next();
}

/**
 * Generate tokens
 */
function generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId },
    JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh',
    { expiresIn: '30d' }
  );

  return { accessToken, refreshToken };
}

module.exports = {
  authenticateToken,
  requireRole,
  requireOrgAccess,
  generateTokens,
  ROLE_HIERARCHY,
};
