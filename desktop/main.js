// desktop/main.js — GinyScreen桌面版（Electron 主进程）
// 职责：内嵌启动信令服务器 → 打开主窗口；系统托盘驻留；日志落盘（Debug 版）
import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, session, dialog, ipcMain, shell, desktopCapturer } from 'electron';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 崩溃报告：主进程未捕获异常/拒绝 → 写 crash_时间戳_类型.txt ──
process.on('uncaughtException', (err) => { writeCrashReport('uncaughtException', err); });
process.on('unhandledRejection', (reason) => { writeCrashReport('unhandledRejection', reason instanceof Error ? reason : new Error(String(reason))); });

function writeCrashReport(kind, err) {
  try {
    const dir = process.env.LOG_DIR || join(__dirname, '..', 'logs');
    mkdirSync(dir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = join(dir, `crash_${ts}_${kind}.txt`);
    writeFileSync(file, `${kind}: ${err?.stack || err}\n`, 'utf8');
    console.error('已写入崩溃报告:', file);
  } catch { /* 崩溃报告失败不阻塞退出 */ }
}

// Debug 版判定：便携版 exe 文件名含 "Debug"，或环境变量 GV_DEBUG=1
// （便携版运行时 electron-builder 会注入 PORTABLE_EXECUTABLE_FILE）
const isDebugBuild = (process.env.PORTABLE_EXECUTABLE_FILE || process.execPath).toLowerCase().includes('debug') || process.env.GV_DEBUG === '1';

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
let serverPort = 3000;
let pendingDisplayCapture = null; // { callback, audioRequested, sources }

// ── 服务器连接配置（本机开服 / 连接朋友的远程服务器）──
let connCfg = { mode: 'local', address: '' };
let remoteOrigin = null;

function connectionFile() {
  return join(app.getPath('userData'), 'connection.json');
}

function readConnectionConfig() {
  try {
    const raw = readFileSync(connectionFile(), 'utf8');
    const cfg = JSON.parse(raw);
    if (cfg && cfg.mode === 'remote' && typeof cfg.address === 'string' && cfg.address.trim()) {
      return { mode: 'remote', address: normalizeRemoteAddress(cfg.address) };
    }
  } catch { /* 无配置或损坏 → 本机开服 */ }
  return { mode: 'local', address: '' };
}

function normalizeRemoteAddress(input) {
  let s = String(input).trim();
  if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
  try {
    const u = new URL(s);
    if (!u.port) u.port = '3000';
    return u.origin;
  } catch {
    return '';
  }
}

function writeConnectionConfig(cfg) {
  const dir = app.getPath('userData');
  mkdirSync(dir, { recursive: true });
  writeFileSync(connectionFile(), JSON.stringify(cfg, null, 2), 'utf8');
}

function getLocalUrls(port) {
  const urls = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.internal || net.address === '::1' || net.address.startsWith('fe80')) continue;
      urls.push(net.family === 'IPv6' ? `http://[${net.address}]:${port}` : `http://${net.address}:${port}`);
    }
  }
  return urls;
}

async function bootstrap() {
  const isPackaged = app.isPackaged;
  const logDir = resolveLogDir(isPackaged);
  process.env.LOG_DIR = logDir;
  process.env.NODE_ENV = isDebugBuild ? 'debug' : 'production';
  process.env.DEBUG_LOG = isDebugBuild ? '1' : '0';

  const { startGinyScreenServer } = await import('../server/app.js');
  const { logger } = await import('../server/logger.js');
  logger.work('══════════════════════════════════════════');
  logger.work('  🖥️ GinyScreen 桌面版启动中 (Debug 日志已开启)');
  logger.work(`  日志目录: ${logDir}`);
  logger.work('══════════════════════════════════════════');

  connCfg = readConnectionConfig();
  remoteOrigin = connCfg.mode === 'remote' ? connCfg.address : null;
  if (remoteOrigin) {
    // 远程服务器多为内网/虚拟局域网明文 HTTP，Chromium 默认不给 getUserMedia 权限；
    // 将该 origin 标记为安全来源（必须在 app ready 前设置）
    app.commandLine.appendSwitch('unsafely-treat-insecure-origin-as-secure', remoteOrigin);
    logger.work(`连接远程服务器: ${remoteOrigin}`);
  }

  try {
    serverHandle = await startGinyScreenServer({
      port: Number(process.env.PORT || 3000),
      host: '::',          // 双栈监听：本机/局域网/ZeroTier 虚拟网/IPv6 均可访问
      retryOnBusy: true,
    });
  } catch (err) {
    logger.error('服务器启动失败:', err);
    dialog.showErrorBox('GinyScreen', '服务器启动失败，请查看日志：\n' + (err?.message || String(err)));
    app.quit();
    return;
  }

  serverPort = serverHandle.port;
  appUrl = remoteOrigin || `http://127.0.0.1:${serverPort}`;
  logger.work(`服务器已启动: ${appUrl}`);

  openDebugConsole(logDir);

  app.setAppUserModelId('com.ginyscreen.app');

  await app.whenReady();

  // 权限：屏幕采集 / 系统声音 自动放行（本软件只加载自家页面）
  // 注意：session 必须在 app ready 之后使用
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const allow = ['media', 'display-capture', 'audioCapture', 'videoCapture', 'mediaKeySystem'].includes(permission);
    callback(allow);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    ['media', 'display-capture', 'audioCapture', 'videoCapture'].includes(permission)
  );

  wireDisplayCapture();

  createWindow();
  createTray();
  wireUpdater();
  logger.work('桌面版就绪，主窗口已打开');

  // 安装版启动时后台静默检查更新（便携版/开发版不自动检查）
  if (app.isPackaged && !isPortableBuild()) {
    autoCheckUpdate();
  }
}

// ── 屏幕采集：注册 getDisplayMedia 处理器，用桌面源列表做内置选择器 ──
function wireDisplayCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
        fetchWindowIcons: true,
      });
      const list = sources.map((src) => ({
        id: src.id,
        name: src.name,
        type: String(src.id).startsWith('screen:') ? 'screen' : 'window',
        thumbnail: src.thumbnail && !src.thumbnail.isEmpty() ? src.thumbnail.toDataURL() : '',
      }));
      pendingDisplayCapture = { callback, audioRequested: request.audioRequested, sources };
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('gv:display-source-list', list);
      } else {
        callback(null);
      }
    } catch (err) {
      logger.error('desktopCapturer 获取源失败:', err);
      callback(null);
    }
  });

  ipcMain.on('gv:pick-display-source', (_e, sourceId) => {
    const pending = pendingDisplayCapture;
    pendingDisplayCapture = null;
    if (!pending) return;
    const source = pending.sources.find((src) => src.id === sourceId);
    if (!source) { pending.callback(null); return; }
    pending.callback({
      video: source,
      audio: pending.audioRequested ? 'loopback' : undefined,
    });
  });

  ipcMain.on('gv:cancel-display-source', () => {
    const pending = pendingDisplayCapture;
    pendingDisplayCapture = null;
    pending?.callback(null);
  });
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

// Debug 控制台：打包版弹出一个窗口实时滚动显示 work/error 日志（开发模式直接看终端，不弹）
function openDebugConsole(logDir) {
  if (!app.isPackaged || !isDebugBuild) return; // 开发模式日志已在终端可见；正式版不弹控制台
  try {
    const scriptPath = join(logDir, '_debug-console.ps1');
    const ps = `$Host.UI.RawUI.WindowTitle = 'GinyScreen Debug 控制台'
Write-Host '=================================================='
Write-Host '  GinyScreen Debug 控制台 - 实时日志'
Write-Host ('  日志目录: ' + '${logDir}')
Write-Host '  关闭本窗口不影响程序运行；退出程序后窗口自动失效'
Write-Host '=================================================='
$pos = @{}
while ($true) {
  Get-ChildItem -Path '${logDir}' -Filter *.log -ErrorAction SilentlyContinue | ForEach-Object {
    $f = $_
    $len = $f.Length
    if (-not $pos.ContainsKey($f.FullName)) { $pos[$f.FullName] = 0 }
    if ($len -gt $pos[$f.FullName]) {
      try {
        $stream = [System.IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')
        $stream.Seek($pos[$f.FullName], 'Begin') | Out-Null
        $reader = New-Object System.IO.StreamReader($stream)
        $text = $reader.ReadToEnd()
        $reader.Close()
        $stream.Close()
        if ($text) { Write-Host $text.TrimEnd([char]13, [char]10) }
        $pos[$f.FullName] = $len
      } catch { }
    }
  }
  Start-Sleep -Milliseconds 500
}`;
    // PS 5.1 需带 BOM 才能正确读取中文
    writeFileSync(scriptPath, '\ufeff' + ps, 'utf8');
    // 以 logs 目录为 cwd 用相对文件名启动，避免项目路径中的 & 干扰命令行
    const child = spawn('powershell.exe', ['-NoExit', '-ExecutionPolicy', 'Bypass', '-File', '_debug-console.ps1'], {
      cwd: logDir,
      stdio: 'ignore',
    });
    child.unref();
  } catch { /* 控制台打不开不阻塞主程序 */ }
}

function createWindow() {
  const iconPath = join(__dirname, '..', 'assets', 'tray.png');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'GinyScreen',
    icon: iconPath,
    backgroundColor: '#14151a',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.cjs'),
    },
  });
  mainWindow.loadURL(appUrl);
  mainWindow.webContents.on('render-process-gone', (_e, details) =>
    writeCrashReport('renderer-gone', new Error(JSON.stringify(details)))
  );
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      mainWindow.hide(); // 最小化到托盘
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  if (isDebugBuild) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

function createTray() {
  if (process.platform === 'darwin') return;
  const image = nativeImage.createFromPath(join(__dirname, '..', 'assets', 'tray.png'));
  tray = new Tray(image);
  tray.setToolTip('GinyScreen');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开主界面', click: () => showMainWindow() },
    { label: '复制访问地址', click: () => clipboard.writeText(remoteOrigin || getLocalUrls(serverPort)[0] || appUrl) },
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

// ---------- 自动更新（IPC + 后台检查）----------
function isPortableBuild() {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR);
}

function wireUpdater() {
  ipcMain.handle('gv:check-update', async () => {
    const { checkForUpdate } = await import('./updater.js');
    return checkForUpdate({
      currentVersion: app.getVersion(),
      onStatus: (stage) => mainWindow?.webContents.send('gv:update-progress', { stage }),
    });
  });
  ipcMain.handle('gv:apply-update', async () => {
    const { applyUpdate } = await import('./updater.js');
    return applyUpdate({
      currentVersion: app.getVersion(),
      logger,
      onProgress: (stage) => mainWindow?.webContents.send('gv:update-progress', { stage }),
    });
  });
  ipcMain.handle('gv:open-release-page', async () => {
    const { RELEASE_PAGE } = await import('./updater.js');
    shell.openExternal(RELEASE_PAGE);
    return { ok: true };
  });
  // 服务器设置（帮助 → 服务器设置）
  ipcMain.handle('gv:get-server-config', () => ({
    mode: connCfg.mode,
    address: connCfg.address,
    localUrls: getLocalUrls(serverPort),
  }));
  ipcMain.handle('gv:set-server-config', (_e, { mode, address } = {}) => {
    const nextMode = mode === 'remote' ? 'remote' : 'local';
    const nextAddress = nextMode === 'remote' ? normalizeRemoteAddress(address || '') : '';
    if (nextMode === 'remote' && !nextAddress) return { ok: false, error: '服务器地址无效' };
    writeConnectionConfig({ mode: nextMode, address: nextAddress });
    logger.work(`服务器设置已保存: ${nextMode}${nextAddress ? ' → ' + nextAddress : ''}`);
    setTimeout(() => { app.relaunch(); app.exit(0); }, 500); // 切换服务器需重启生效
    return { ok: true, restarting: true };
  });
  // 界面内退出（帮助 → 退出 GinyScreen）
  ipcMain.on('gv:quit', () => { quitting = true; shutdown(); });
}

async function autoCheckUpdate() {
  try {
    const { checkForUpdate } = await import('./updater.js');
    const result = await checkForUpdate({ currentVersion: app.getVersion() });
    if (result.ok && result.hasUpdate) {
      mainWindow?.webContents.send('gv:update-available', result);
      logger.work(`发现新版本 v${result.latest}`);
    }
  } catch { /* 后台检查失败静默处理 */ }
}

// 退出：必须先 app.quit()。内嵌服务器上挂着本应用自己的 Socket.IO 长连接，
// 若先 await server.close() 会永远等不到回调（连接不释放）导致“退不出去”。
function shutdown() {
  try { serverHandle?.server?.closeAllConnections?.(); } catch { /* 忽略 */ }
  try { serverHandle?.server?.close(); } catch { /* 忽略 */ }
  app.quit();
}

app.on('window-all-closed', () => { /* 驻留托盘，不退出 */ });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => {
  try { serverHandle?.server?.close(); } catch { /* 兜底关闭 */ }
});
