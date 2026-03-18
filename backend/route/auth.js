const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  const hash = await bcrypt.hash(password, 10);

  const user = await pool.query(
    'INSERT INTO users(email, password) VALUES($1,$2) RETURNING *',
    [email, hash]
  );

  res.json(user.rows[0]);
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await pool.query(
    'SELECT * FROM users WHERE email=$1',
    [email]
  );

  if (!user.rows.length) return res.status(400).send("User not found");

  const valid = await bcrypt.compare(password, user.rows[0].password);
  if (!valid) return res.status(400).send("Wrong password");

  const token = jwt.sign({ id: user.rows[0].id }, "secret");

  res.json({ token });
});

module.exports = router;
