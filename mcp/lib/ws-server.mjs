// Minimal RFC 6455 WebSocket server for FlashFX Link (no dependency, like the rest of mcp/).
// Text + binary frames, fragmentation, ping/pong, close. No extensions (permessage-deflate is never
// negotiated), no subprotocols. Client frames MUST be masked (the browser always masks); an unmasked
// client frame, a reserved bit or an oversized payload closes the connection with 1002 / 1009.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const MAX_PAYLOAD = 96 * 1024 * 1024; // a 4 MB upload chunk is ~5.6 MB as base64 JSON; generous cap

/** Sec-WebSocket-Accept for a Sec-WebSocket-Key. */
export function acceptKey(key) {
  return createHash('sha1').update(`${key}${GUID}`).digest('base64');
}

/** Encode one unmasked (server to client) frame. */
export function encodeFrame(opcode, payload, { fin = true, mask = null } = {}) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload ?? '');
  const len = body.length;
  let header;
  if (len < 126) { header = Buffer.alloc(2); header[1] = len; }
  else if (len < 65536) { header = Buffer.alloc(4); header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  header[0] = (fin ? 0x80 : 0) | opcode;
  if (!mask) return Buffer.concat([header, body]);
  // Masked frames are only produced by tests acting as a browser client.
  header[1] |= 0x80;
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = body[i] ^ mask[i & 3];
  return Buffer.concat([header, mask, masked]);
}

/**
 * Incremental frame decoder. `push(chunk)` returns the complete frames now available:
 * { fin, opcode, payload } (payload unmasked). Throws { code } on a protocol violation.
 */
export class FrameDecoder {
  constructor({ requireMask = true, maxPayload = MAX_PAYLOAD } = {}) {
    this.buf = Buffer.alloc(0);
    this.requireMask = requireMask;
    this.maxPayload = maxPayload;
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    const out = [];
    for (;;) {
      if (this.buf.length < 2) break;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      if (b0 & 0x70) throw Object.assign(new Error('reserved bits set'), { code: 1002 });
      const masked = (b1 & 0x80) !== 0;
      if (this.requireMask && !masked) throw Object.assign(new Error('client frame not masked'), { code: 1002 });
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) break;
        len = this.buf.readUInt16BE(2); off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) break;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(this.maxPayload)) throw Object.assign(new Error('frame too large'), { code: 1009 });
        len = Number(big); off = 10;
      }
      if (len > this.maxPayload) throw Object.assign(new Error('frame too large'), { code: 1009 });
      const maskOff = off;
      if (masked) off += 4;
      if (this.buf.length < off + len) break;
      const payload = Buffer.from(this.buf.subarray(off, off + len));
      if (masked) {
        const m = this.buf.subarray(maskOff, maskOff + 4);
        for (let i = 0; i < len; i++) payload[i] ^= m[i & 3];
      }
      out.push({ fin: (b0 & 0x80) !== 0, opcode: b0 & 0x0f, payload });
      this.buf = this.buf.subarray(off + len);
    }
    return out;
  }
}

/** One accepted WebSocket connection. Events: 'message' (data: string | Buffer, isBinary), 'close' (code, reason). */
export class WsConnection extends EventEmitter {
  constructor(socket, { maxPayload = MAX_PAYLOAD } = {}) {
    super();
    this.socket = socket;
    this.decoder = new FrameDecoder({ maxPayload });
    this.maxPayload = maxPayload;
    this.fragments = null; // { opcode, parts, size } while a fragmented message is in flight
    this.closed = false;
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.onData(chunk));
    socket.on('close', () => this.finish(1006, 'socket closed'));
    socket.on('error', () => this.finish(1006, 'socket error'));
  }

  onData(chunk) {
    let frames;
    try { frames = this.decoder.push(chunk); } catch (e) { this.close(e.code ?? 1002, e.message); return; }
    for (const f of frames) {
      if (this.closed) return;
      if (f.opcode === 0x8) { // close
        const code = f.payload.length >= 2 ? f.payload.readUInt16BE(0) : 1005;
        this.close(code === 1005 ? 1000 : code, 'peer closed');
        return;
      }
      if (f.opcode === 0x9) { this.write(encodeFrame(0xA, f.payload)); continue; } // ping -> pong
      if (f.opcode === 0xA) continue; // pong
      if (f.opcode === 0x1 || f.opcode === 0x2) {
        if (this.fragments) { this.close(1002, 'new message inside a fragmented one'); return; }
        if (f.fin) { this.deliver(f.opcode, f.payload); continue; }
        this.fragments = { opcode: f.opcode, parts: [f.payload], size: f.payload.length };
        continue;
      }
      if (f.opcode === 0x0) {
        if (!this.fragments) { this.close(1002, 'continuation without a start'); return; }
        this.fragments.parts.push(f.payload);
        this.fragments.size += f.payload.length;
        if (this.fragments.size > this.maxPayload) { this.close(1009, 'message too large'); return; }
        if (f.fin) {
          const { opcode, parts } = this.fragments;
          this.fragments = null;
          this.deliver(opcode, Buffer.concat(parts));
        }
        continue;
      }
      this.close(1002, `unknown opcode ${f.opcode}`);
      return;
    }
  }

  deliver(opcode, payload) {
    if (opcode === 0x1) this.emit('message', payload.toString('utf8'), false);
    else this.emit('message', payload, true);
  }

  write(buf) {
    if (!this.closed && !this.socket.destroyed) this.socket.write(buf);
  }

  send(data) {
    if (Buffer.isBuffer(data)) this.write(encodeFrame(0x2, data));
    else this.write(encodeFrame(0x1, Buffer.from(String(data), 'utf8')));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const r = Buffer.from(String(reason).slice(0, 120), 'utf8');
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    this.write(encodeFrame(0x8, p));
    this.finish(code, reason);
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 500).unref();
  }

  finish(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.emit('close', code, reason);
  }
}

/**
 * Complete the server side of the opening handshake on an HTTP 'upgrade' request, or reject it.
 * `check(req)` returns null to accept or { status, reason } to refuse (e.g. a bad Origin).
 */
export function acceptUpgrade(req, socket, check) {
  const refuse = (status, reason) => {
    socket.end(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    return null;
  };
  if ((req.headers.upgrade ?? '').toLowerCase() !== 'websocket') return refuse(426, 'Upgrade Required');
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string' || Buffer.from(key, 'base64').length !== 16) return refuse(400, 'Bad Request');
  if (req.headers['sec-websocket-version'] !== '13') return refuse(426, 'Upgrade Required');
  const verdict = check(req);
  if (verdict) return refuse(verdict.status, verdict.reason);
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey(key)}`,
    '', '',
  ].join('\r\n'));
  return new WsConnection(socket);
}
