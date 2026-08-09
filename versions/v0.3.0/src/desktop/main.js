// desktop/main.js — 开黑电台桌面版（Electron 主进程）
// 职责：内嵌启动信令服务器 → 打开主窗口；系统托盘驻留；日志落盘（Debug 版）
import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, session, dialog } from 'electron';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 单实例锁：重复启动时唤起已有窗口 ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  bootstrap();
}

let mainWindow = null;
let tray = null;
let serverHandle = null;
let appUrl = '';
let quitting = false;

async function bootstrap() {
  const isPackaged = app.isPackaged;
  const logDir = resolveLogDir(isPackaged);
  process.env.LOG_DIR = logDir;
  process.env.NODE_ENV = 'debug';
  process.env.DEBUG_LOG = '1';

  const { startKaiheiServer } = await import('../server/app.js');
  const { logger } = await import('../server/logger.js');
  logger.work('══════════════════════════════════════════');
  logger.work('  📻 开黑电台 桌面版启动中 (Debug 日志已开启)');
  logger.work(`  日志目录: ${logDir}`);
  logger.work('══════════════════════════════════════════');

  try {
    serverHandle = await startKaiheiServer({
      port: Number(process.env.PORT || 3000),
      host: '127.0.0.1',
      retryOnBusy: true,
    });
  } catch (err) {
    logger.error('服务器启动失败:', err);
    dialog.showErrorBox('开黑电台', '服务器启动失败，请查看日志：\n' + (err?.message || String(err)));
    app.quit();
    return;
  }

  const port = serverHandle.port;
  appUrl = `http://127.0.0.1:${port}`;
  logger.work(`服务器已启动: ${appUrl}`);

  app.setAppUserModelId('com.kaihei.radio');

  await app.whenReady();

  // 权限：麦克风 / 摄像头 / 屏幕共享 自动放行（本软件只加载自家页面）
  // 注意：session 必须在 app ready 之后使用
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = ['media', 'display-capture', 'audioCapture', 'videoCapture', 'mediaKeySystem'].includes(permission);
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'display-capture', 'audioCapture', 'videoCapture'].includes(permission)
  );

  createWindow();
  createTray();
  logger.work('桌面版就绪，主窗口已打开');
}

function resolveLogDir(isPackaged) {
  if (!isPackaged) {
    return join(__dirname, '..', 'logs');
  }
  // 便携版：exe 所在目录
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return join(process.env.PORTABLE_EXECUTABLE_DIR, 'logs');
  }
  // 安装版：优先安装目录，不可写时退回用户数据目录
  const exeLogDir = join(dirname(process.execPath), 'logs');
  try {
    mkdirSync(exeLogDir, { recursive: true });
    writeFileSync(join(exeLogDir, '.write-test'), 'ok');
    return exeLogDir;
  } catch {
    return join(app.getPath('userData'), 'logs');
  }
}

function createWindow() {
  const iconPath = join(__dirname, '..', 'assets', 'tray.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: '开黑电台',
    icon: iconPath,
    backgroundColor: '#14151a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.loadURL(appUrl);
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide(); // 最小化到托盘
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createTray() {
  if (process.platform === 'darwin') return;
  const image = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(image);
  tray.setToolTip('开黑电台');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主界面', click: () => showMainWindow() },
    { label: '复制访问地址', click: () => clipboard.writeText(appUrl) },
    { type: 'separator' },
    { label: '退出', click: () => { quitting = true; shutdown(); } },
  ]));
  tray.on('double-click', () => showMainWindow());
}

function showMainWindow() {
  if (!mainWindow) { createWindow(); return; }
  mainWindow.show();
  mainWindow.focus();
}

async function shutdown() {
  try {
    if (serverHandle?.server) {
      await new Promise((r) => serverHandle.server.close(r));
    }
  } catch { /* 忽略关闭异常 */ }
  app.quit();
}

app.on('window-all-closed', () => { /* 驻留托盘，不退出 */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  try { serverHandle?.server?.close(); } catch { /* 兜底关闭 */ }
});
