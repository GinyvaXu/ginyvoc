// index.js — ginyvoc 信令服务器 CLI 入口（复用 app.js 的可嵌入启动函数）
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { startGinyVocServer } from './app.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '::';   // 双栈监听（IPv4 + IPv6）
const useHttps = process.env.HTTPS === '1';

// STUN/TURN 配置: 默认 Google STUN; 自建 TURN 通过环境变量注入
const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
const TURN_URL = process.env.TURN_URL;
const TURN_USER = process.env.TURN_USER;
const TURN_PASS = process.env.TURN_PASS;
if (TURN_URL && TURN_USER && TURN_PASS) {
  iceServers.push({ urls: TURN_URL, username: TURN_USER, credential: TURN_PASS });
}

let serverHandle;
try {
  serverHandle = await startGinyVocServer({ port: PORT, host: HOST, useHttps, iceServers });
} catch (err) {
  logger.error('服务器启动失败:', err);
  process.exit(1);
}

const { server, port } = serverHandle;
const proto = useHttps ? 'https' : 'http';
logger.work('══════════════════════════════════════════');
logger.work('  📻 GinyVoC 语音服务器已启动 (Debug 版日志已开启)');
logger.work(`  日志目录: ${process.env.LOG_DIR || join(process.cwd(), 'temp', 'logs')}`);
logger.work(`  本机: ${proto}://localhost:${port}`);
const nets = getLanAddresses();
if (nets.length) {
  logger.work(`  局域网: ${proto}://${nets[0]}:${port}`);
  if (!useHttps) {
    logger.work('  ⚠️  非本机访问需 HTTPS 才能用麦克风:');
    logger.work('     npm run certs 生成证书后，HTTPS=1 npm start');
  }
}
logger.work(`  ICE: ${JSON.stringify(iceServers)}`);
logger.work('══════════════════════════════════════════');

function getLanAddresses() {
  const nets = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.internal || net.address === '::1' || net.address.startsWith('fe80')) continue;
      nets.push(net.family === 'IPv6' ? `[${net.address}]` : net.address);
    }
  }
  return nets;
}

// 未捕获异常/拒绝 → 写入报错日志（Debug 版重点）
process.on('uncaughtException', (err) => {
  logger.error('uncaughtException:', err);
  logger.error('服务器将退出，请查看报错日志');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection:', reason);
});
