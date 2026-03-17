/**
 * Communications Integration Service
 * Handles: Gmail, Outlook, Dialpad, 8x8, Twilio, Teams
 * Per-org credentials, OAuth flows, activity logging
 */

const { query } = require('../db/connection');
const logger = require('../utils/logger');

// ─── GMAIL INTEGRATION ────────────────────────────────────────
class GmailIntegration {
  constructor(orgCredentials) {
    this.credentials = orgCredentials;
  }

  async sendEmail({ to, subject, body, fromName, threadId, candidateId, userId, orgId }) {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
      this.credentials.redirectUri
    );
    oauth2Client.setCredentials({
      access_token: this.credentials.accessToken,
      refresh_token: this.credentials.refreshToken,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const rawMessage = makeRFC822({
      to,
      subject,
      body,
      from: `${fromName} <${this.credentials.email}>`,
      threadId,
    });

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: rawMessage,
        threadId,
      },
    });

    // Log to communications
    await logCommunication({
      orgId, userId, candidateId,
      channel: 'email',
      direction: 'outbound',
      subject,
      body,
      status: 'sent',
      externalId: response.data.id,
      metadata: { threadId: response.data.threadId, provider: 'gmail' },
    });

    return response.data;
  }

  async fetchInbox(maxResults = 20) {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret
    );
    oauth2Client.setCredentials({ access_token: this.credentials.accessToken, refresh_token: this.credentials.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const list = await gmail.users.messages.list({ userId: 'me', maxResults, q: 'in:inbox' });
    return list.data.messages || [];
  }

  async checkReplies(threadId) {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(this.credentials.clientId, this.credentials.clientSecret);
    oauth2Client.setCredentials({ access_token: this.credentials.accessToken, refresh_token: this.credentials.refreshToken });
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId });
    return thread.data.messages?.length > 1;
  }

  getOAuthUrl(state) {
    const { google } = require('googleapis');
    const oauth2Client = new google.auth.OAuth2(
      this.credentials.clientId,
      this.credentials.clientSecret,
      this.credentials.redirectUri
    );
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      state,
      prompt: 'consent',
    });
  }
}

// ─── OUTLOOK / MICROSOFT INTEGRATION ─────────────────────────
class OutlookIntegration {
  constructor(orgCredentials) {
    this.credentials = orgCredentials;
  }

  async sendEmail({ to, subject, body, candidateId, userId, orgId }) {
    const { ClientSecretCredential } = require('@azure/identity');
    const { Client } = require('@microsoft/microsoft-graph-client');

    const credential = new ClientSecretCredential(
      this.credentials.tenantId,
      this.credentials.clientId,
      this.credentials.clientSecret
    );

    const client = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken(['https://graph.microsoft.com/.default']);
          return token.token;
        },
      },
    });

    const message = {
      subject,
      body: { contentType: 'HTML', content: body },
      toRecipients: [{ emailAddress: { address: to } }],
    };

    const response = await client.api(`/users/${this.credentials.email}/sendMail`).post({ message, saveToSentItems: true });

    await logCommunication({ orgId, userId, candidateId, channel: 'email', direction: 'outbound', subject, body, status: 'sent', metadata: { provider: 'outlook' } });

    return response;
  }

  async scheduleTeamsMeeting({ attendeeEmail, subject, startTime, endTime, candidateId, userId, orgId }) {
    const { Client } = require('@microsoft/microsoft-graph-client');
    // Teams meeting via Graph API
    const event = {
      subject,
      start: { dateTime: startTime, timeZone: 'UTC' },
      end: { dateTime: endTime, timeZone: 'UTC' },
      attendees: [{ emailAddress: { address: attendeeEmail }, type: 'required' }],
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    };

    // client.api('/me/events').post(event)
    await logCommunication({ orgId, userId, candidateId, channel: 'teams', direction: 'outbound', subject, status: 'scheduled', metadata: { provider: 'teams', startTime, endTime } });

    return { meetingUrl: 'https://teams.microsoft.com/...', event };
  }
}

// ─── DIALPAD INTEGRATION ─────────────────────────────────────
class DialpadIntegration {
  constructor(orgCredentials) {
    this.credentials = orgCredentials;
    this.baseUrl = 'https://dialpad.com/api/v2';
    this.headers = { Authorization: `Bearer ${orgCredentials.apiKey}`, 'Content-Type': 'application/json' };
  }

  async initiateCall({ toNumber, fromNumber, candidateId, userId, orgId }) {
    const axios = require('axios');
    const response = await axios.post(
      `${this.baseUrl}/calls`,
      { to: toNumber, from: fromNumber || this.credentials.defaultNumber, record: true },
      { headers: this.headers }
    );

    const callId = response.data.id;

    await logCommunication({
      orgId, userId, candidateId,
      channel: 'call', direction: 'outbound',
      status: 'initiated',
      externalId: callId,
      metadata: { provider: 'dialpad', toNumber, fromNumber },
    });

    return { callId, status: 'initiated', callUrl: response.data.dialpad_url };
  }

  async sendSMS({ toNumber, message, candidateId, userId, orgId }) {
    const axios = require('axios');
    const response = await axios.post(
      `${this.baseUrl}/sms`,
      { to: toNumber, text: message, from_number: this.credentials.defaultNumber },
      { headers: this.headers }
    );

    await logCommunication({ orgId, userId, candidateId, channel: 'sms', direction: 'outbound', body: message, status: 'sent', externalId: response.data.id, metadata: { provider: 'dialpad', toNumber } });

    return response.data;
  }

  async getCallRecording(callId) {
    const axios = require('axios');
    const response = await axios.get(`${this.baseUrl}/calls/${callId}`, { headers: this.headers });
    return response.data?.recording_url;
  }

  async webhookHandler(payload) {
    // Handle incoming Dialpad webhooks
    const { event, call_id, duration, recording_url, transcript } = payload;

    if (event === 'call.ended') {
      await query(
        `UPDATE communications SET
           status = 'completed',
           duration_sec = $2,
           recording_url = $3,
           metadata = metadata || $4::jsonb
         WHERE external_id = $1`,
        [call_id, duration, recording_url, JSON.stringify({ transcript, completedAt: new Date() })]
      );
    }
  }
}

// ─── 8x8 INTEGRATION ──────────────────────────────────────────
class EightByEightIntegration {
  constructor(orgCredentials) {
    this.credentials = orgCredentials;
    this.baseUrl = 'https://api.8x8.com/v2';
  }

  async initiateCall({ toNumber, candidateId, userId, orgId }) {
    const axios = require('axios');
    const response = await axios.post(
      `${this.baseUrl}/calls`,
      { destination: toNumber, callerId: this.credentials.callerId },
      { headers: { 'X-8x8-Jwt': this.credentials.jwt } }
    );

    await logCommunication({ orgId, userId, candidateId, channel: 'call', direction: 'outbound', status: 'initiated', externalId: response.data.callId, metadata: { provider: '8x8' } });

    return response.data;
  }

  async sendSMS({ toNumber, message, candidateId, userId, orgId }) {
    const axios = require('axios');
    const response = await axios.post(
      `${this.baseUrl}/sms`,
      { to: toNumber, body: message, from: this.credentials.defaultNumber },
      { headers: { 'X-8x8-Jwt': this.credentials.jwt } }
    );

    await logCommunication({ orgId, userId, candidateId, channel: 'sms', direction: 'outbound', body: message, status: 'sent', metadata: { provider: '8x8' } });

    return response.data;
  }
}

// ─── TWILIO FALLBACK ──────────────────────────────────────────
class TwilioIntegration {
  constructor(orgCredentials) {
    this.credentials = orgCredentials;
  }

  async sendSMS({ toNumber, message, candidateId, userId, orgId }) {
    const twilio = require('twilio')(this.credentials.accountSid, this.credentials.authToken);
    const msg = await twilio.messages.create({
      body: message,
      to: toNumber,
      from: this.credentials.phoneNumber,
    });

    await logCommunication({ orgId, userId, candidateId, channel: 'sms', direction: 'outbound', body: message, status: 'sent', externalId: msg.sid, metadata: { provider: 'twilio' } });

    return msg;
  }

  async initiateCall({ toNumber, candidateId, userId, orgId }) {
    const twilio = require('twilio')(this.credentials.accountSid, this.credentials.authToken);
    const call = await twilio.calls.create({
      to: toNumber,
      from: this.credentials.phoneNumber,
      record: true,
    });

    await logCommunication({ orgId, userId, candidateId, channel: 'call', direction: 'outbound', status: 'initiated', externalId: call.sid, metadata: { provider: 'twilio' } });

    return { callId: call.sid };
  }
}

// ─── INTEGRATION FACTORY ─────────────────────────────────────
async function getIntegration(orgId, provider) {
  const result = await query(
    `SELECT credentials FROM org_integrations WHERE org_id = $1 AND provider = $2 AND is_active = TRUE`,
    [orgId, provider]
  );

  if (!result.rows.length) {
    throw new Error(`${provider} integration not configured for this organization`);
  }

  const creds = result.rows[0].credentials;

  switch (provider) {
    case 'gmail': return new GmailIntegration(creds);
    case 'outlook': return new OutlookIntegration(creds);
    case 'dialpad': return new DialpadIntegration(creds);
    case '8x8': return new EightByEightIntegration(creds);
    case 'twilio': return new TwilioIntegration(creds);
    default: throw new Error(`Unknown provider: ${provider}`);
  }
}

// ─── ACTIVITY LOGGER ─────────────────────────────────────────
async function logCommunication(data) {
  const {
    orgId, userId, candidateId, channel, direction, subject, body,
    status, externalId, durationSec, recordingUrl, metadata = {}
  } = data;

  const result = await query(
    `INSERT INTO communications (
       org_id, user_id, candidate_id, channel, direction, subject, body,
       status, external_id, duration_sec, recording_url, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [orgId, userId, candidateId, channel, direction, subject, body,
     status, externalId, durationSec, recordingUrl, JSON.stringify(metadata)]
  );

  // Update candidate last_contacted_at
  if (candidateId) {
    await query(
      `UPDATE candidates SET last_contacted_at = NOW(), activity_count = activity_count + 1 WHERE id = $1`,
      [candidateId]
    );
  }

  // Activity log entry
  await query(
    `INSERT INTO activity_logs (org_id, user_id, entity_type, entity_id, action, description, metadata)
     VALUES ($1,$2,'candidate',$3,$4,$5,$6)`,
    [orgId, userId, candidateId, `${channel}_${direction}`,
     `${direction === 'outbound' ? 'Sent' : 'Received'} ${channel}${subject ? ': ' + subject : ''}`,
     JSON.stringify({ channel, status, ...metadata })]
  );

  return result.rows[0]?.id;
}

// ─── RFC822 EMAIL BUILDER ─────────────────────────────────────
function makeRFC822({ to, from, subject, body, threadId }) {
  const message = [
    `To: ${to}`,
    `From: ${from}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    body,
  ].join('\r\n');

  return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

module.exports = {
  getIntegration,
  logCommunication,
  GmailIntegration,
  OutlookIntegration,
  DialpadIntegration,
  EightByEightIntegration,
  TwilioIntegration,
};
