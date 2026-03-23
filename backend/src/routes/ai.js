/**
 * AI Recruiter Assistant Routes
 * OpenAI-powered email generation, scoring, summarization
 */

const express = require('express');
const OpenAI = require('openai');
const { query } = require('../db/connection');
const { requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const MODEL = 'gpt-4o';

function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function requireOpenAI(res) {
  const client = getOpenAI();
  if (!client) {
    res.status(503).json({ error: 'AI features are not configured. Set OPENAI_API_KEY to enable them.' });
    return null;
  }
  return client;
}

// ─── Generate Outreach Email ──────────────────────────────────
router.post('/generate-email', requireOrgAccess, async (req, res) => {
  try {
    const openai = requireOpenAI(res);
    if (!openai) return;

    const { candidateId, jobId, emailType = 'initial_outreach', customContext } = req.body;

    // Fetch candidate and job details
    const [candidateRes, jobRes] = await Promise.all([
      candidateId ? query(
        `SELECT c.*, p.education, p.residency, p.board_certifications, p.hospital_affiliations
         FROM candidates c LEFT JOIN providers p ON p.id = c.provider_id
         WHERE c.id = $1 AND c.org_id = $2`,
        [candidateId, req.orgId]
      ) : null,
      jobId ? query('SELECT * FROM jobs WHERE id = $1 AND org_id = $2', [jobId, req.orgId]) : null,
    ]);

    const candidate = candidateRes?.rows[0];
    const job = jobRes?.rows[0];

    const systemPrompt = `You are an expert healthcare staffing recruiter with 15+ years experience. 
You write compelling, personalized outreach emails to physicians and healthcare providers.
Your emails are professional, warm, and concise. Never sound generic or robotic.
Focus on the specific value proposition for this provider's background.`;

    let userPrompt = '';

    switch (emailType) {
      case 'initial_outreach':
        userPrompt = `Write an initial outreach email to a healthcare provider.

Provider Details:
- Name: Dr. ${candidate?.last_name || 'Provider'}
- Specialty: ${candidate?.specialty || 'Not specified'}
- Location: ${candidate?.city || ''}, ${candidate?.state || ''}
- Credentials: ${candidate?.credential || 'MD'}

${job ? `Job Opportunity:
- Title: ${job.title}
- Facility: ${job.facility_name}
- Location: ${job.location_city}, ${job.location_state}
- Type: ${job.job_type}
- Salary Range: ${job.salary_min ? `$${job.salary_min.toLocaleString()} - $${job.salary_max?.toLocaleString()}` : 'Competitive'}` : ''}

${customContext ? `Additional Context: ${customContext}` : ''}

Generate a personalized subject line and email body. Format as JSON with keys: subject, body`;
        break;

      case 'follow_up':
        userPrompt = `Write a professional follow-up email for a healthcare recruiter.
This is a follow-up to a previous outreach that didn't get a response.

Provider: Dr. ${candidate?.last_name || 'Provider'} (${candidate?.specialty || 'Physician'})
${job ? `Opportunity: ${job.title} at ${job.facility_name}` : ''}

Keep it brief, add value, create urgency without being pushy.
Format as JSON with keys: subject, body`;
        break;

      case 'interview_confirmation':
        userPrompt = `Write an interview confirmation email for a healthcare provider.
Provider: Dr. ${candidate?.last_name || 'Provider'}
${job ? `Position: ${job.title} at ${job.facility_name}` : ''}
${customContext || ''}

Include: confirmation details, what to expect, contact information.
Format as JSON with keys: subject, body`;
        break;

      case 'offer':
        userPrompt = `Write a professional offer email for a healthcare provider.
Provider: Dr. ${candidate?.last_name || 'Provider'}
${job ? `Position: ${job.title}` : ''}
${customContext || ''}

Congratulatory, professional tone. Include next steps.
Format as JSON with keys: subject, body`;
        break;
    }

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.7,
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // Log generation
    await query(
      `INSERT INTO ai_generations (org_id, user_id, generation_type, entity_type, entity_id, 
        prompt_tokens, completion_tokens, model, output)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        req.orgId, req.user.id, emailType, 'candidate', candidateId,
        completion.usage.prompt_tokens, completion.usage.completion_tokens,
        MODEL, JSON.stringify(result),
      ]
    );

    res.json({
      subject: result.subject,
      body: result.body,
      tokens: completion.usage,
    });
  } catch (error) {
    logger.error('AI email generation error:', error);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

// ─── Score Candidate-Job Match ─────────────────────────────────
router.post('/score-match', requireOrgAccess, async (req, res) => {
  try {
    const { candidateId, jobId } = req.body;

    const [candidateRes, jobRes] = await Promise.all([
      query(
        `SELECT c.*, p.education, p.board_certifications, p.hospital_affiliations
         FROM candidates c LEFT JOIN providers p ON p.id = c.provider_id
         WHERE c.id = $1 AND c.org_id = $2`,
        [candidateId, req.orgId]
      ),
      query('SELECT * FROM jobs WHERE id = $1 AND org_id = $2', [jobId, req.orgId]),
    ]);

    if (!candidateRes.rows.length || !jobRes.rows.length) {
      return res.status(404).json({ error: 'Candidate or job not found' });
    }

    const candidate = candidateRes.rows[0];
    const job = jobRes.rows[0];

    const prompt = `You are a healthcare staffing expert. Score how well this candidate matches the job.

CANDIDATE:
- Name: Dr. ${candidate.first_name} ${candidate.last_name}
- Specialty: ${candidate.specialty}
- Credentials: ${candidate.credential}
- Location: ${candidate.city}, ${candidate.state}
- Board Certifications: ${candidate.board_certifications?.join(', ') || 'None listed'}
- Hospital Affiliations: ${candidate.hospital_affiliations?.join(', ') || 'None listed'}
- Willing to Relocate: ${candidate.willing_to_relocate ? 'Yes' : 'No'}

JOB:
- Title: ${job.title}
- Specialty Required: ${job.specialty}
- Location: ${job.location_city}, ${job.location_state}
- Type: ${job.job_type}
- Facility: ${job.facility_name}
- Requirements: ${job.requirements || 'Not specified'}

Provide a match analysis as JSON with:
- score: number 0-100
- grade: "A" | "B" | "C" | "D" | "F"
- strengths: string[] (top 3 matching factors)
- gaps: string[] (top 3 gaps or concerns)
- recommendation: "strong_match" | "good_match" | "possible_match" | "poor_match"
- summary: string (2-3 sentence summary)`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.3,
    });

    const matchResult = JSON.parse(completion.choices[0].message.content);

    // Store score in submission if exists
    await query(
      `UPDATE submissions SET ai_match_score = $1 
       WHERE candidate_id = $2 AND job_id = $3 AND org_id = $4`,
      [matchResult.score, candidateId, jobId, req.orgId]
    );

    await query(
      `INSERT INTO ai_generations (org_id, user_id, generation_type, entity_type, entity_id, 
        prompt_tokens, completion_tokens, model, output)
       VALUES ($1,$2,'match_score','submission',$3,$4,$5,$6,$7)`,
      [
        req.orgId, req.user.id, `${candidateId}:${jobId}`,
        completion.usage.prompt_tokens, completion.usage.completion_tokens,
        MODEL, JSON.stringify(matchResult),
      ]
    );

    res.json(matchResult);
  } catch (error) {
    logger.error('AI match scoring error:', error);
    res.status(500).json({ error: 'Failed to score match' });
  }
});

// ─── Summarize Provider Profile ───────────────────────────────
router.post('/summarize-provider', requireOrgAccess, async (req, res) => {
  try {
    const openai = requireOpenAI(res);
    if (!openai) return;
    const { candidateId } = req.body;

    const result = await query(
      `SELECT c.*, p.education, p.residency, p.fellowship, p.board_certifications, 
              p.hospital_affiliations, p.languages
       FROM candidates c LEFT JOIN providers p ON p.id = c.provider_id
       WHERE c.id = $1 AND c.org_id = $2`,
      [candidateId, req.orgId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    const c = result.rows[0];

    const prompt = `Create a professional recruiter summary for this healthcare provider profile.

Provider: Dr. ${c.first_name} ${c.last_name}, ${c.credential}
Specialty: ${c.specialty}
Location: ${c.city}, ${c.state}
Education: ${JSON.stringify(c.education || [])}
Residency: ${JSON.stringify(c.residency || [])}
Fellowship: ${JSON.stringify(c.fellowship || [])}
Board Certifications: ${c.board_certifications?.join(', ') || 'Not listed'}
Hospital Affiliations: ${c.hospital_affiliations?.join(', ') || 'Not listed'}
Languages: ${c.languages?.join(', ') || 'English'}

Write a concise 3-4 sentence professional summary highlighting key qualifications, experience, and value. 
Suitable for presenting to healthcare facilities. Professional tone.

Return JSON with: summary (string), highlights (string[] of 4-5 key points), yearsEstimate (string)`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0.5,
    });

    const summary = JSON.parse(completion.choices[0].message.content);
    res.json(summary);
  } catch (error) {
    logger.error('AI summarize error:', error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// ─── Generate Follow-up Sequence ──────────────────────────────
router.post('/generate-sequence', requireOrgAccess, async (req, res) => {
  try {
    const openai = requireOpenAI(res);
    if (!openai) return;
    const { candidateId, jobId, sequenceLength = 3 } = req.body;

    const [candidateRes, jobRes] = await Promise.all([
      candidateId ? query(
        'SELECT * FROM candidates WHERE id = $1 AND org_id = $2',
        [candidateId, req.orgId]
      ) : Promise.resolve({ rows: [{}] }),
      jobId ? query('SELECT * FROM jobs WHERE id = $1 AND org_id = $2', [jobId, req.orgId]) : Promise.resolve({ rows: [{}] }),
    ]);

    const candidate = candidateRes.rows[0];
    const job = jobRes.rows[0];

    const prompt = `Create a ${sequenceLength}-email outreach sequence for healthcare recruiting.

Provider: Dr. ${candidate.last_name || 'Provider'} - ${candidate.specialty || 'Physician'}
${job.title ? `Opportunity: ${job.title} at ${job.facility_name}` : ''}

Create ${sequenceLength} emails spaced: Day 1 (initial), Day 4 (follow-up), Day 10 (final).
Each email should be different in approach and angle. Vary value propositions.

Return JSON: { emails: [{ day: number, subject: string, body: string, angle: string }] }`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.7,
    });

    const sequence = JSON.parse(completion.choices[0].message.content);
    res.json(sequence);
  } catch (error) {
    logger.error('AI sequence generation error:', error);
    res.status(500).json({ error: 'Failed to generate sequence' });
  }
});

// ─── AI Chat Assistant ────────────────────────────────────────
router.post('/chat', requireOrgAccess, async (req, res) => {
  try {
    const { messages, context } = req.body;

    const systemPrompt = `You are ProviderIQ AI, an expert healthcare staffing assistant. 
You help recruiters with sourcing physicians, writing communications, analyzing candidates, 
and optimizing their staffing pipeline. 

Context about this organization's current activity:
${JSON.stringify(context || {})}

Be concise, actionable, and specific to healthcare staffing.`;

    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      max_tokens: 1000,
      temperature: 0.7,
      stream: true,
    });

    // Stream response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    for await (const chunk of completion) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    logger.error('AI chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI assistant error' });
    }
  }
});

module.exports = router;
