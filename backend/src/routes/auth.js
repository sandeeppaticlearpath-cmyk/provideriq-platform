/**
 * Authentication Routes
 * POST /api/auth/login
 * POST /api/auth/refresh
 * POST /api/auth/logout
 * GET  /api/auth/me
 */

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../db/connection');
const { generateTokens, authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-me';
const jwt = require('jsonwebtoken');

// ─── Login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, orgSlug } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Build query - optionally filter by org slug
    let userQuery = `
      SELECT u.*, o.name as org_name, o.slug as org_slug, o.plan as org_plan, o.settings as org_settings
      FROM users u
      JOIN organizations o ON o.id = u.org_id
      WHERE u.email = $1 AND u.is_active = TRUE AND o.status = 'active'
    `;
    const params = [email.toLowerCase()];

    if (orgSlug) {
      userQuery += ' AND o.slug = $2';
      params.push(orgSlug);
    }

    const result = await query(userQuery, params);

    if (!result.rows.length) {
      // Timing-safe response (prevent user enumeration)
      await bcrypt.compare(password, '$2b$12$invalidhashtopreventtimingattacks');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      logger.warn(`Failed login attempt: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Store refresh token hash
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [user.id, tokenHash]
    );

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        avatarUrl: user.avatar_url,
        orgId: user.org_id,
        orgName: user.org_name,
        orgSlug: user.org_slug,
        orgPlan: user.org_plan,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// ─── Refresh Token ────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET + '_refresh');
    } catch {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Check token exists in DB
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const result = await query(
      `SELECT rt.*, u.is_active FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW() AND u.is_active = TRUE`,
      [tokenHash]
    );

    if (!result.rows.length) {
      return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }

    // Delete old, issue new
    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    const tokens = generateTokens(decoded.userId);

    const newHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '30 days')`,
      [decoded.userId, newHash]
    );

    res.json(tokens);
  } catch (error) {
    logger.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// ─── Logout ───────────────────────────────────────────────────
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ─── Current User ─────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
              u.avatar_url, u.phone, u.title, u.preferences, u.last_login_at,
              o.id as org_id, o.name as org_name, o.slug as org_slug,
              o.plan as org_plan, o.logo_url as org_logo, o.settings as org_settings
       FROM users u JOIN organizations o ON o.id = u.org_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'User not found' });
    }

    const u = result.rows[0];
    res.json({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      avatarUrl: u.avatar_url,
      phone: u.phone,
      title: u.title,
      preferences: u.preferences,
      lastLoginAt: u.last_login_at,
      org: {
        id: u.org_id,
        name: u.org_name,
        slug: u.org_slug,
        plan: u.org_plan,
        logoUrl: u.org_logo,
        settings: u.org_settings,
      },
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

module.exports = router;
