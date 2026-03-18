const express = require('express');
const router = express.Router();
const axios = require('axios');

// 🔍 SEARCH DOCTORS
router.get('/search', async (req, res) => {
  try {
    const name = req.query.name || "";
    const state = req.query.state || "";

    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&name=${name}&state=${state}`;

    const response = await axios.get(url);

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching providers:", error.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
