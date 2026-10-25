/* GolKafa sunucusu — Node.js 18+  |  npm install && npm start */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('./tinyws.js');
const SIM = require('./sim.js');

const PORT = process.env.PORT || 8080;
const PUBLIC = fs.existsSync(path.join(__dirname, 'public')) ? path.join(__dirname, 'public') : __dirname; // tek klasör kurulumu da çalışsın
const FLAT = PUBLIC === __dirname;
const DATA_FILE = process.env.DATA_FILE || (fs.existsSync(path.join(__dirname, 'data')) ? path.join(__dirname, 'data', 'data.json') : path.join(__dirname, 'data.json'));

// ---------- Kalıcı veri (nickname kayıtları, rank puanı) ----------
let DB = { nicks: {} };
try { DB = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) {}
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => fs.writeFile(DATA_FILE, JSON.stringify(DB), () => {}), 500); }
const normNick = (n) => String(n || '').trim().toLowerCase();

// ---------- HTTP: istemciyi sun ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(PUBLIC, path.normalize(p));
  if (!file.startsWith(PUBLIC) || (FLAT && !['index.html', 'sim.js'].includes(path.basename(file)))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('yok'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server });
const clients = new Map();   // ws -> client
const online = new Map();    // nick(lower) -> client
const queues = { '1v1': [], '2v2': [] };
const customs = new Map();   // code -> {host, mode, members:[client]}
const rooms = new Set();

function send(c, msg) { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg)); }
function err(c, m) { send(c, { t: 'err', m }); }

wss.on('connection', (ws) => {
  const c = { ws, nick: null, room: null, slot: null, custom: null, prof: {}, input: {} };
  clients.set(ws, c);
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    try { handle(c, m); } catch (e) { console.error(e); }
  });
  ws.on('close', () => {
    clients.delete(ws);
    if (c.nick) online.delete(normNick(c.nick));
    leaveQueue(c); leaveCustom(c);
    if (c.room) c.room.drop(c);
    broadcastPresence(c.nick, false);
  });
});

function handle(c, m) {
  switch (m.t) {
    case 'hello': {
      // nickname kaydı: ilk alan sahibidir, token ile geri gelir
      const nick = String(m.nick || '').trim().slice(0, 16);
      if (!/^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,16}$/.test(nick)) return send(c, { t: 'hello', ok: false, why: 'Takma ad 3-16 karakter olmalı; sadece harf, rakam ve _ kullan.' });
      const key = normNick(nick);
      const rec = DB.nicks[key];
      if (rec && rec.token !== m.token) return send(c, { t: 'hello', ok: false, why: 'Bu takma ad alınmış. Başka bir tane dene.' });
      if (online.has(key) && online.get(key) !== c) return send(c, { t: 'hello', ok: false, why: 'Bu hesap şu an başka bir cihazda açık.' });
      if (!rec) { DB.nicks[key] = { nick, token: crypto.randomBytes(12).toString('hex'), rp: 0, wins: 0, played: 0, created: Date.now() }; save(); }
      c.nick = DB.nicks[key].nick; c.prof = { boots: m.boots || 'basic', ability: m.ability || null, level: m.level || 1, prestige: m.prestige || 0 };
      online.set(key, c);
      send(c, { t: 'hello', ok: true, nick: c.nick, token: DB.nicks[key].token, rp: DB.nicks[key].rp, wins: DB.nicks[key].wins, played: DB.nicks[key].played, online: online.size });
      broadcastPresence(c.nick, true);
      break;
    }
    case 'prof': if (c.nick) c.prof = Object.assign(c.prof, { boots: m.boots, ability: m.ability, level: m.level, prestige: m.prestige }); break;
    case 'presence': { // arkadaşlardan kim çevrimiçi?
      if (!c.nick) return;
      const list = (m.friends || []).map(normNick);
      send(c, { t: 'presence', online: list.filter((n) => online.has(n)).map((n) => online.get(n).nick), total: online.size });
      break;
    }
    case 'queue': {
      if (!c.nick || c.room) return;
      leaveQueue(c); leaveCustom(c);
      const q = queues[m.mode]; if (!q) return;
      q.push(c); send(c, { t: 'queued', mode: m.mode, n: q.length });
      const need = m.mode === '1v1' ? 2 : 4;
      if (q.length >= need) {
        const members = q.splice(0, need);
        startRoom(m.mode, members.map((cl, i) => ({ client: cl, team: m.mode === '1v1' ? i : (i < 2 ? 0 : 1) })), true);
      }
      break;
    }
    case 'dequeue': leaveQueue(c); send(c, { t: 'dequeued' }); break;
    case 'custom_create': {
      if (!c.nick || c.room) return;
      leaveQueue(c); leaveCustom(c);
      const code = crypto.randomBytes(2).toString('hex').toUpperCase();
      const room = { code, host: c, mode: m.mode === '2v2' ? '2v2' : '1v1', members: [c] };
      customs.set(code, room); c.custom = room;
      sendCustom(room);
      break;
    }
    case 'custom_join': {
      if (!c.nick || c.room) return;
      const room = customs.get(String(m.code || '').toUpperCase());
      if (!room) return err(c, 'Böyle bir oda yok.');
      const cap = room.mode === '1v1' ? 2 : 4;
      if (room.members.length >= cap) return err(c, 'Oda dolu.');
      leaveQueue(c); leaveCustom(c);
      room.members.push(c); c.custom = room; sendCustom(room);
      break;
    }
    case 'custom_mode': if (c.custom && c.custom.host === c) { c.custom.mode = m.mode === '2v2' ? '2v2' : '1v1'; sendCustom(c.custom); } break;
    case 'custom_leave': leaveCustom(c); break;
    case 'custom_start': {
      const room = c.custom; if (!room || room.host !== c) return;
      const cap = room.mode === '1v1' ? 2 : 4;
      const entries = room.members.map((cl, i) => ({ client: cl, team: room.mode === '1v1' ? i : (i < 2 ? 0 : 1) }));
      for (let i = entries.length; i < cap; i++) entries.push({ bot: true, team: room.mode === '1v1' ? i : (i < 2 ? 0 : 1) });
      customs.delete(room.code);
      room.members.forEach((cl) => { cl.custom = null; });
      startRoom(room.mode, entries, false);
      break;
    }
    case 'invite': { // arkadaşını özel odaya davet et
      if (!c.nick) return;
      const target = online.get(normNick(m.to));
      if (!target) return send(c, { t: 'err', k: 'offline', n: m.to });
      let room = c.custom;
      if (!room) { handle(c, { t: 'custom_create', mode: m.mode || '1v1' }); room = c.custom; }
      send(target, { t: 'invite', from: c.nick, code: room.code, mode: room.mode });
      send(c, { t: 'toast', k: 'invited', n: target.nick });
      break;
    }
    case 'in': if (c.room) c.room.input(c, m); break;
    case 'rename': {
      if (!c.nick) return;
      const nick = String(m.nick || '').trim().slice(0, 16);
      if (!/^[A-Za-z0-9_çğıöşüÇĞİÖŞÜ]{3,16}$/.test(nick)) return send(c, { t: 'rename', ok: false, why: 'bad' });
      const key = normNick(nick), old = normNick(c.nick);
      if (key !== old && DB.nicks[key]) return send(c, { t: 'rename', ok: false, why: 'taken' });
      const rec = DB.nicks[old]; delete DB.nicks[old]; rec.nick = nick; DB.nicks[key] = rec; save();
      online.delete(old); online.set(key, c); c.nick = nick;
      send(c, { t: 'rename', ok: true, nick, token: rec.token });
      break;
    }
    case 'chat': if (c.room && typeof m.q === 'number') c.room.chat(c, m.q); break;
    case 'leave': if (c.room) c.room.drop(c); break;
  }
}

function leaveQueue(c) { for (const k in queues) { const i = queues[k].indexOf(c); if (i >= 0) queues[k].splice(i, 1); } }
function leaveCustom(c) {
  const r = c.custom; if (!r) return; c.custom = null;
  r.members = r.members.filter((x) => x !== c);
  if (!r.members.length) return customs.delete(r.code);
  if (r.host === c) r.host = r.members[0];
  sendCustom(r);
}
function sendCustom(r) { r.members.forEach((cl) => send(cl, { t: 'custom', code: r.code, mode: r.mode, host: r.host.nick, members: r.members.map((x) => x.nick) })); }
function broadcastPresence(nick, on) { if (!nick) return; for (const cl of clients.values()) if (cl.nick && cl !== online.get(normNick(nick))) send(cl, { t: 'friend', nick, on }); }

// ---------- Maç odası ----------
function startRoom(mode, entries, ranked) {
  const room = {
    mode, ranked, clients: [], inputs: {}, bots: [],
    state: null, acc: 0, last: Date.now(), sendAcc: 0, done: false,
  };
  const players = entries.map((e, i) => {
    if (e.bot) { room.bots.push(i); return { id: i, team: e.team, name: 'Bot ' + (i + 1), bot: true, boots: ['ember', 'frost', 'venom'][i % 3], ability: 'power' }; }
    e.client.room = room; e.client.slot = i; room.clients.push(e.client);
    return { id: i, team: e.team, name: e.client.nick, boots: e.client.prof.boots, ability: e.client.prof.ability, level: e.client.prof.level };
  });
  room.state = SIM.createState(mode, players);
  rooms.add(room);
  const stadium = ['night', 'coast', 'neon'][Math.floor(Math.random() * 3)];
  room.clients.forEach((cl) => send(cl, { t: 'match', mode, ranked, slot: cl.slot, stadium, players: players.map((p) => ({ id: p.id, team: p.team, name: p.name, boots: p.boots, ability: p.ability || null, bot: !!p.bot, level: p.level || 0 })) }));

  room.input = (cl, m) => { room.inputs[cl.slot] = { mx: +m.mx || 0, mz: +m.mz || 0, kick: !!m.k, charge: +m.c || 0, sprint: !!m.s, ab: !!m.a }; };
  room.chat = (cl, q) => room.clients.forEach((x) => send(x, { t: 'chat', from: cl.slot, q }));
  room.drop = (cl) => {
    const i = room.clients.indexOf(cl); if (i < 0) return;
    room.clients.splice(i, 1); cl.room = null;
    if (room.ranked && !room.done && room.state.phase !== 'end') { const rec = DB.nicks[normNick(cl.nick)]; if (rec) { rec.rp = Math.max(0, rec.rp - 20); rec.played++; save(); send(cl, { t: 'result', won: false, draw: false, score: room.state.score, dRp: -20, rp: rec.rp, ranked: true, left: true }); } }
    room.bots.push(cl.slot); // yerine bot geçer
    room.clients.forEach((x) => send(x, { t: 'toast', k: 'left', n: cl.nick }));
    if (!room.clients.length) finish(room, true);
  };
  room.timer = setInterval(() => tick(room), 1000 / 60);
}

function tick(room) {
  if (room.done) return;
  const st = room.state;
  room.bots.forEach((id) => { room.inputs[id] = SIM.botInput(st, id, 0.75); });
  SIM.step(st, room.inputs, SIM.TICK);
  // tek seferlik tuşlar
  for (const k in room.inputs) { if (room.inputs[k]) { room.inputs[k].kick = false; room.inputs[k].ab = false; } }
  room.sendAcc++;
  const important = st.events.length > 0;
  if (room.sendAcc >= 2 || important) { // 30 Hz, olay varsa hemen
    room.sendAcc = 0;
    const pk = SIM.pack(st);
    room.clients.forEach((cl) => send(cl, { t: 'st', d: pk }));
  }
  if (st.phase === 'end') finish(room, false);
}

function finish(room, aborted) {
  room.done = true; clearInterval(room.timer); rooms.delete(room);
  const st = room.state;
  room.clients.forEach((cl) => {
    const me = st.players[cl.slot];
    const won = st.winner === me.team, draw = st.winner === 2;
    let dRp = 0;
    const rec = DB.nicks[normNick(cl.nick)];
    if (room.ranked && rec && !aborted) {
      dRp = won ? 25 : draw ? 5 : -15; rec.rp = Math.max(0, rec.rp + dRp); rec.played++; if (won) rec.wins++; save();
    }
    send(cl, { t: 'result', won, draw, score: st.score, dRp, rp: rec ? rec.rp : 0, ranked: room.ranked });
    cl.room = null;
  });
}

server.listen(PORT, () => {
  console.log(`NeonKick sunucusu hazır → http://localhost:${PORT}`);
  const os = require('os'); Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).forEach((i) => console.log(`Telefondan (aynı Wi-Fi): http://${i.address}:${PORT}`));
});
