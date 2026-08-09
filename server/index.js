// index.js — kaihei-radio 信令服务器入口
// 默认 HTTP (localhost 可用麦克风); 局域网/其他设备使用需 HTTPS (npm run certs && HTTPS=1)
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { setupSignaling } from './signaling.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// STUN/TURN 配置: 默认 Google STUN; 自建 TURN 通过环境变量注入
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
const TURN_URL = process.env.TURN_URL;
const TURN_USER = process.env.TURN_USER;
const TURN_PASS = process.env.TURN_PASS;
if (TURN_URL && TURN_USER && TURN_PASS) {
  iceServers.push({ urls: TURN_URL, username: TURN_USER, credential: TURN_PASS });
}

const app = express();
app.use(express.static(join(__dirname, '..', 'client')));
app.use('/vendor/socket.io', express.static(join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist')));
// 客户端拉取 ICE 配置
app.get('/api/config', (_req, res) => {
  res.json({ iceServers, maxPeersPerChannel: 8 });
});

const rooms = new RoomManager();
const useHttps = process.env.HTTPS === '1';
const certDir = join(__dirname, '..', '中间产物', 'certs');
const keyPath = join(certDir, 'key.pem');
const certPath = join(certDir, 'cert.pem');

let server;
if (useHttps) {
  if (!existsSync(keyPath) || !existsSync(certPath)) {
    console.error('未找到证书，请先运行: npm run certs');
    process.exit(1);
  }
  const { createServer: createHttpsServer } = await import('node:https');
  server = createHttpsServer({
    key: readFileSync(keyPath),
    cert: readFileSync(certPath),
  }, app);
} else {
  server = createServer(app);
}

const io = new Server(server, {
  serveClient: true,
  cors: { origin: true },
});
setupSignaling(io, rooms);

server.listen(PORT, HOST, () => {
  const proto = useHttps ? 'https' : 'http';
  console.log('══════════════════════════════════════════');
  console.log('  📻 开黑电台 语音服务器已启动');
  console.log(`  本机: ${proto}://localhost:${PORT}`);
  const nets = getLanAddresses();
  if (nets.length) {
    console.log(`  局域网: ${proto}://${nets[0]}:${PORT}`);
    if (!useHttps) {
      console.log('  ⚠️  非本机访问需 HTTPS 才能用麦克风:');
      console.log('     npm run certs 生成证书后，HTTPS=1 npm start');
    }
  }
  console.log(`  ICE: ${JSON.stringify(iceServers)}`);
  console.log('══════════════════════════════════════════');
});

function getLanAddresses() {
  const nets = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) nets.push(net.address);
    }
  }
  return nets;
}



