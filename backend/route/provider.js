const express = require('express');
const axios = require('axios');

const router = express.Router();

router.get('/search', async (req, res) => {
  const { name, specialty } = req.query;

  let url = `https://npiregistry.cms.hhs.gov/api/?version=2.1`;

  if (name) url += `&name=${name}`;
  if (specialty) url += `&taxonomy_description=${specialty}`;

  const response = await axios.get(url);

  const results = response.data.results.map(p => ({
    name: p.basic.name,
    npi: p.number,
    specialty: p.taxonomies?.[0]?.desc,
    address: p.addresses?.[0]?.address_1
  }));

  res.json(results);
});

module.exports = router;
