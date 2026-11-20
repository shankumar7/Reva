// Free push notifications through Firebase Cloud Messaging (HTTP v1).
// Only a generic "something new" message is sent. No names, no text, no sender, nothing from the chat.
import crypto from 'node:crypto';
import fs from 'node:fs';

interface ServiceAccount { project_id: string; client_email: string; private_key: string; token_uri?: string }

const TEXT: Record<string, { title: string; body: string }> = {
  calculator: { title: 'Calculator', body: 'Tap to open' },
  notes: { title: 'Notes', body: 'Reminder' },
  chat: { title: 'Chat', body: 'New message' },
  alarm: { title: 'Alarm', body: 'Tap to open' }, // a call, dressed as an alarm
};

export class Fcm {
  private sa: ServiceAccount;
  private access: { token: string; until: number } | null = null;
  constructor(
    serviceAccountPath: string,
    private urls = { send: (project: string) => `https://fcm.googleapis.com/v1/projects/${project}/messages:send` },
    private fetchImpl: typeof fetch = fetch,
  ) {
    this.sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    if (!this.sa.project_id || !this.sa.client_email || !this.sa.private_key) throw new Error('fcm service account file is incomplete');
  }

  private async accessToken(): Promise<string> {
    if (this.access && this.access.until > Date.now() + 60_000) return this.access.token;
    const uri = this.sa.token_uri ?? 'https://oauth2.googleapis.com/token';
    const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const head = b64u({ alg: 'RS256', typ: 'JWT' });
    const claim = b64u({ iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: uri, iat: now, exp: now + 3600 });
    const sig = crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), this.sa.private_key).toString('base64url');
    const r = await this.fetchImpl(uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
    });
    if (!r.ok) throw new Error('fcm auth failed: ' + r.status);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    this.access = { token: j.access_token, until: Date.now() + j.expires_in * 1000 };
    return j.access_token;
  }

  /** Returns 'ok', 'gone' (token no longer valid, forget it) or 'error'. */
  async send(token: string, kind: string): Promise<'ok' | 'gone' | 'error'> {
    try {
      const t = TEXT[kind] ?? TEXT.calculator;
      const r = await this.fetchImpl(this.urls.send(this.sa.project_id), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + (await this.accessToken()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: t.title, body: t.body },
            android: { priority: 'HIGH', notification: { channel_id: 'general' } },
          },
        }),
      });
      if (r.ok) return 'ok';
      if (r.status === 404 || r.status === 400) return 'gone';
      return 'error';
    } catch {
      return 'error';
    }
  }
}
