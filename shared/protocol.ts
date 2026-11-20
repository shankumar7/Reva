// Wire format between phone and server. Everything private is inside `blob`.

export type ClientMsg =
  | { t: 'register'; token: string; signPk: string }
  | { t: 'auth'; signPk: string; sig: string }
  | { t: 'send'; cid: string; blob: string; ephemeral?: boolean }
  | { t: 'ack'; ids: number[] }
  | { t: 'push'; token: string; kind?: 'calculator' | 'notes' } // phone's notification address (no content ever goes through it)
  | { t: 'ping' };

export type ServerMsg =
  | { t: 'hello'; nonce: string; registrationOpen: boolean }
  | { t: 'registered'; slot: number }
  | { t: 'ready'; peerSignPk: string | null; peerOnline: boolean }
  | { t: 'sent'; cid: string; id: number | null } // id null for ephemeral
  | { t: 'msg'; id: number; blob: string; ts: number }
  | { t: 'peer'; online: boolean; signPk: string | null }
  | { t: 'error'; code: string }
  | { t: 'pong' };

/** What goes inside an encrypted blob. */
export type Envelope =
  | { k: 'msg'; id: string; ts: number; text: string; replyTo?: string; once?: boolean; ttl?: number }
  | { k: 'edit'; id: string; text: string }
  | { k: 'del'; id: string }
  | { k: 'react'; id: string; emoji: string | null }
  | { k: 'rcpt'; ids: string[]; state: 'delivered' | 'read' }
  | { k: 'typing'; on: boolean }
  | { k: 'hi' } // "thinking of you"
  | { k: 'img'; id: string; ts: number; data: string; thumb: string; w: number; h: number; once?: boolean; ttl?: number; replyTo?: string }
  | { k: 'aud'; id: string; ts: number; data: string; dur: number; ttl?: number; replyTo?: string } // voice note (data = base64 m4a)
  | { k: 'viewed'; id: string } // a view-once picture was opened
  | { k: 'pin'; id: string; on: boolean }
  | { k: 'snote'; id: string; title: string; body: string; ts: number; del?: boolean }; // shared notes

/** What the first phone shows as a QR code. */
export interface PairQr {
  v: 1;
  url: string; // wss://host
  token: string; // setup token
  signPk: string; // first phone's public key
}
/** What the second phone shows back. */
export interface PairReplyQr {
  v: 1;
  signPk: string;
}
