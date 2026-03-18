const express = require('express');
const pool = require('../db');

const router = express.Router();

// SAVE
router.post('/', async (req, res) => {
  const { name, npi, specialty } = req.body;

  const result = await pool.query(
    `INSERT INTO bob(name, npi, specialty, status)
     VALUES($1,$2,$3,'New') RETURNING *`,
    [name, npi, specialty]
  );

  res.json(result.rows[0]);
});

// GET ALL
router.get('/', async (req, res) => {
  const result = await pool.query('SELECT * FROM bob');
  res.json(result.rows);
});

// UPDATE
router.put('/:id', async (req, res) => {
  const { status, notes } = req.body;

  const result = await pool.query(
    `UPDATE bob SET status=$1, notes=$2 WHERE id=$3 RETURNING *`,
    [status, notes, req.params.id]
  );

  res.json(result.rows[0]);
});

// DELETE
router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM bob WHERE id=$1', [req.params.id]);
  res.send("Deleted");
});

module.exports = router;
