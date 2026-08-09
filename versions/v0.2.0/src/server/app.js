// app.js — 可嵌入的服务器启动函数（CLI 与 Electron 桌面壳共用）
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { RoomManager } from './rooms.js';
import { setupSignaling } from './signaling.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 启动开黑电台服务器（HTTP/Socket.IO + 静态客户端）
 * @param {object} opts
 * @param {number}  [opts.port=3000]       监听端口
 * @param {string}  [opts.host='0.0.0.0']  监听地址
 * @param {boolean} [opts.useHttps=false]  是否 HTTPS（需已生成证书）
 * @param {Array}   [opts.iceServers]      WebRTC ICE 服务器列表
 * @param {boolean} [opts.retryOnBusy=false] 端口占用时自动 +1 重试（桌面壳用）
 * @returns {Promise<{server, io, app, port}>}
 */
export async function startKaiheiServer(opts = {}) {
  const port = opts.port ?? 3000;
  const host = opts.host ?? '0.0.0.0';
  const useHttps = opts.useHttps ?? false;
  const iceServers = opts.iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }];
  const retryOnBusy = opts.retryOnBusy ?? false;

  const app = express();
  app.use((req, res, next) => {
    const isStatic = /^\/(js|css|vendor|favicon)/.test(req.path);
    res.on('finish', () => {
      if (!isStatic) logger.debug(`HTTP ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });
    next();
  });
  app.use(express.static(join(__dirname, '..', 'client')));
  app.use('/vendor/socket.io', express.static(join(__dirname, '..', 'node_modules', 'socket.io', 'client-dist')));

  // 客户端拉取 ICE 配置
  app.get('/api/config', (_req, res) => {
    res.json({ iceServers, maxPeersPerChannel: 8 });
  });

  const rooms = new RoomManager();

  let server;
  if (useHttps) {
    const certDir = join(__dirname, '..', '中间产物', 'certs');
    const keyPath = join(certDir, 'key.pem');
    const certPath = join(certDir, 'cert.pem');
    if (!existsSync(keyPath) || !existsSync(certPath)) {
      throw new Error('未找到证书，请先运行: npm run certs');
    }
    const { createServer: createHttpsServer } = await import('node:https');
    server = createHttpsServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, app);
  } else {
    server = createServer(app);
  }

  const io = new Server(server, { serveClient: true, cors: { origin: true } });
  setupSignaling(io, rooms);

  const actualPort = await listen(server, port, host, retryOnBusy);
  return { server, io, app, port: actualPort };
}

function listen(server, port, host, retryOnBusy) {
  return new Promise((resolve, reject) => {
    const attempt = (p) => {
      const onError = (err) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && retryOnBusy && p < port + 20) {
          logger.work(`端口 ${p} 被占用，改用 ${p + 1}`);
          attempt(p + 1);
        } else {
          reject(err);
        }
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve(server.address().port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(p, host);
    };
    attempt(port);
  });
}
