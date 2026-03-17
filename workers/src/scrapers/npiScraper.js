/**
 * NPI Registry Scraper Worker
 * Pulls and syncs provider data from CMS NPI Registry API
 */

const axios = require('axios');
const { query } = require('../db/connection');
const logger = require('../utils/logger');

const NPI_API_BASE = 'https://npiregistry.cms.hhs.gov/api';
const BATCH_SIZE = 200;
const RATE_LIMIT_MS = 500; // 500ms between requests

/**
 * Fetch providers from NPI Registry by taxonomy/specialty
 */
async function syncNPIByTaxonomy(taxonomyCode, skip = 0) {
  try {
    logger.info(`NPI Sync: taxonomy=${taxonomyCode} skip=${skip}`);

    const response = await axios.get(`${NPI_API_BASE}`, {
      params: {
        taxonomy_description: taxonomyCode,
        enumeration_type: 'NPI-1', // Individual providers only
        limit: BATCH_SIZE,
        skip,
        version: '2.1',
      },
      timeout: 30000,
    });

    const { results, result_count } = response.data;

    if (!results?.length) {
      return { synced: 0, total: result_count || 0 };
    }

    let synced = 0;
    for (const provider of results) {
      await upsertProvider(provider);
      synced++;
    }

    return { synced, total: result_count };
  } catch (error) {
    logger.error(`NPI sync error for taxonomy ${taxonomyCode}:`, error.message);
    throw error;
  }
}

/**
 * Fetch single provider by NPI number
 */
async function fetchProviderByNPI(npi) {
  try {
    const response = await axios.get(`${NPI_API_BASE}`, {
      params: { number: npi, version: '2.1' },
      timeout: 10000,
    });

    const results = response.data?.results;
    if (!results?.length) return null;

    return await upsertProvider(results[0]);
  } catch (error) {
    logger.error(`Fetch NPI ${npi} error:`, error.message);
    return null;
  }
}

/**
 * Transform and upsert provider from NPI API response
 */
async function upsertProvider(npiData) {
  const basic = npiData.basic || {};
  const addresses = npiData.addresses || [];
  const taxonomies = npiData.taxonomies || [];
  const identifiers = npiData.identifiers || [];

  // Primary address (practice location)
  const primaryAddr = addresses.find(a => a.address_purpose === 'LOCATION') || addresses[0] || {};
  
  // Primary taxonomy
  const primaryTaxonomy = taxonomies.find(t => t.primary) || taxonomies[0] || {};

  // Build education from other names/identifiers (limited in NPI)
  const hospitalAffiliations = identifiers
    .filter(id => id.identifier_type === 'other')
    .map(id => id.issuer)
    .filter(Boolean);

  const providerData = {
    npi: npiData.number,
    firstName: basic.first_name || '',
    lastName: basic.last_name || basic.organization_name || '',
    middleName: basic.middle_name || '',
    credential: basic.credential || '',
    gender: basic.gender === 'M' ? 'Male' : basic.gender === 'F' ? 'Female' : null,
    specialty: primaryTaxonomy.desc || '',
    taxonomyCode: primaryTaxonomy.code || '',
    taxonomyDescription: primaryTaxonomy.desc || '',
    practiceAddress: primaryAddr.address_1 || '',
    city: primaryAddr.city || '',
    state: primaryAddr.state || '',
    zip: primaryAddr.postal_code || '',
    phone: primaryAddr.telephone_number || '',
    fax: primaryAddr.fax_number || '',
    npiStatus: basic.status || 'A',
    enumerationDate: basic.enumeration_date || null,
    lastUpdateDate: basic.last_updated || null,
    hospitalAffiliations,
    rawNpiData: npiData,
  };

  const result = await query(`
    INSERT INTO providers (
      npi, first_name, last_name, middle_name, credential, gender,
      specialty, taxonomy_code, taxonomy_description, address_line1,
      city, state, zip, phone, fax, npi_status, enumeration_date,
      last_update_date, hospital_affiliations, raw_npi_data
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
      $11,$12,$13,$14,$15,$16,$17,$18,$19,$20
    )
    ON CONFLICT (npi) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      credential = EXCLUDED.credential,
      specialty = EXCLUDED.specialty,
      taxonomy_code = EXCLUDED.taxonomy_code,
      city = EXCLUDED.city,
      state = EXCLUDED.state,
      phone = EXCLUDED.phone,
      npi_status = EXCLUDED.npi_status,
      last_update_date = EXCLUDED.last_update_date,
      hospital_affiliations = EXCLUDED.hospital_affiliations,
      raw_npi_data = EXCLUDED.raw_npi_data,
      updated_at = NOW()
    RETURNING id, npi
  `, [
    providerData.npi, providerData.firstName, providerData.lastName,
    providerData.middleName, providerData.credential, providerData.gender,
    providerData.specialty, providerData.taxonomyCode, providerData.taxonomyDescription,
    providerData.practiceAddress, providerData.city, providerData.state,
    providerData.zip, providerData.phone, providerData.fax,
    providerData.npiStatus, providerData.enumerationDate, providerData.lastUpdateDate,
    providerData.hospitalAffiliations, JSON.stringify(providerData.rawNpiData),
  ]);

  return result.rows[0];
}

/**
 * Bulk sync by state for physician specialties
 */
async function bulkSyncByState(state, specialties = PHYSICIAN_SPECIALTIES) {
  logger.info(`Starting bulk NPI sync: state=${state}`);
  let totalSynced = 0;

  for (const specialty of specialties) {
    try {
      let skip = 0;
      let hasMore = true;

      while (hasMore) {
        const response = await axios.get(`${NPI_API_BASE}`, {
          params: {
            state,
            taxonomy_description: specialty,
            enumeration_type: 'NPI-1',
            limit: BATCH_SIZE,
            skip,
            version: '2.1',
          },
          timeout: 30000,
        });

        const results = response.data?.results || [];
        const total = response.data?.result_count || 0;

        for (const provider of results) {
          await upsertProvider(provider);
          totalSynced++;
        }

        skip += BATCH_SIZE;
        hasMore = skip < total && results.length === BATCH_SIZE;

        // Rate limiting
        await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
      }

      logger.info(`Synced ${specialty} in ${state}`);
    } catch (error) {
      logger.error(`Error syncing ${specialty} in ${state}:`, error.message);
    }
  }

  return totalSynced;
}

// Common physician specialties to sync
const PHYSICIAN_SPECIALTIES = [
  'Internal Medicine',
  'Family Medicine',
  'Emergency Medicine',
  'Hospitalist',
  'Cardiology',
  'Orthopedic Surgery',
  'Anesthesiology',
  'Radiology',
  'Psychiatry',
  'Neurology',
  'Gastroenterology',
  'Pulmonology',
  'Nephrology',
  'Oncology',
  'Urology',
  'Dermatology',
  'Ophthalmology',
  'ENT',
  'Pediatrics',
  'OB/GYN',
  'General Surgery',
  'Neurosurgery',
  'Vascular Surgery',
  'Critical Care',
  'Infectious Disease',
];

module.exports = {
  syncNPIByTaxonomy,
  fetchProviderByNPI,
  upsertProvider,
  bulkSyncByState,
  PHYSICIAN_SPECIALTIES,
};
