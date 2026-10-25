/* Bağımlılıksız minimal WebSocket sunucusu (RFC 6455, metin çerçeveleri). ws paketinin yerine geçer. */
const crypto = require('crypto');
const EventEmitter = require('events');
const MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WebSocket extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.readyState = 1; this.buf = Buffer.alloc(0); this.frags = [];
    socket.on('data', (d) => this._data(d));
    socket.on('close', () => this._closed());
    socket.on('error', () => this._closed());
    socket.on('end', () => socket.end());
  }
  _closed() { if (this.readyState !== 3) { this.readyState = 3; this.emit('close'); } }
  _data(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      const b = this.buf; if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
      if (masked) off += 4;
      if (b.length < off + len) return;
      let payload = b.subarray(off, off + len);
      if (masked) { const m = b.subarray(off - 4, off); const out = Buffer.allocUnsafe(len); for (let i = 0; i < len; i++) out[i] = payload[i] ^ m[i & 3]; payload = out; }
      this.buf = b.subarray(off + len);
      if (op === 8) { this.close(); return; }
      if (op === 9) { this._frame(10, payload); continue; }
      if (op === 10) continue;
      if (op === 0 || !fin) { this.frags.push(payload); if (!fin) continue; payload = Buffer.concat(this.frags); this.frags = []; }
      if (op === 1 || op === 0) this.emit('message', payload.toString('utf8'));
      if (len > 1e6) { this.close(); return; }
    }
  }
  _frame(op, payload) {
    if (this.readyState !== 1) return;
    const len = payload.length; let head;
    if (len < 126) head = Buffer.from([0x80 | op, len]);
    else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
    try { this.socket.write(Buffer.concat([head, payload])); } catch (e) {}
  }
  send(text) { this._frame(1, Buffer.from(String(text), 'utf8')); }
  close() { if (this.readyState === 1) { this.readyState = 2; try { this._frame(8, Buffer.alloc(0)); this.socket.end(); } catch (e) {} } this._closed(); }
}

class WebSocketServer extends EventEmitter {
  constructor(opts) {
    super();
    opts.server.on('upgrade', (req, socket) => {
      const key = req.headers['sec-websocket-key'];
      if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.destroy(); return; }
      const accept = crypto.createHash('sha1').update(key + MAGIC).digest('base64');
      socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
      socket.setNoDelay(true);
      this.emit('connection', new WebSocket(socket), req);
    });
  }
}
module.exports = { WebSocketServer, WebSocket };
