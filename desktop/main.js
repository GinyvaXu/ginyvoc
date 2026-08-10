// desktop/main.js — GinyVoC桌面版（Electron 主进程）
// 职责：内嵌启动信令服务器 → 打开主窗口；系统托盘驻留；日志落盘（Debug 版）
import { app, BrowserWindow, Tray, Menu, nativeImage, clipboard, session, dialog, ipcMain, shell } from 'electron';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
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

async function bootstrap() {
  const isPackaged = app.isPackaged;
  const logDir = resolveLogDir(isPackaged);
  process.env.LOG_DIR = logDir;
  process.env.NODE_ENV = isDebugBuild ? 'debug' : 'production';
  process.env.DEBUG_LOG = isDebugBuild ? '1' : '0';

  const { startGinyVocServer } = await import('../server/app.js');
  const { logger } = await import('../server/logger.js');
  logger.work('══════════════════════════════════════════');
  logger.work('  📻 GinyVoC 桌面版启动中 (Debug 日志已开启)');
  logger.work(`  日志目录: ${logDir}`);
  logger.work('══════════════════════════════════════════');

  try {
    serverHandle = await startGinyVocServer({
      port: Number(process.env.PORT || 3000),
      host: '127.0.0.1',
      retryOnBusy: true,
    });
  } catch (err) {
    logger.error('服务器启动失败:', err);
    dialog.showErrorBox('GinyVoC', '服务器启动失败，请查看日志：\n' + (err?.message || String(err)));
    app.quit();
    return;
  }

  const port = serverHandle.port;
  appUrl = `http://127.0.0.1:${port}`;
  logger.work(`服务器已启动: ${appUrl}`);

  openDebugConsole(logDir);

  app.setAppUserModelId('com.ginyvoc.app');

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
  wireUpdater();
  logger.work('桌面版就绪，主窗口已打开');

  // 安装版启动时后台静默检查更新（便携版/开发版不自动检查）
  if (app.isPackaged && !isPortableBuild()) {
    autoCheckUpdate();
  }
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
    const ps = `$Host.UI.RawUI.WindowTitle = 'GinyVoC Debug 控制台'
Write-Host '=================================================='
Write-Host '  GinyVoC Debug 控制台 - 实时日志'
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
    title: 'GinyVoC',
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
  tray.setToolTip('GinyVoC');
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
  // 界面内退出（帮助 → 退出 GinyVoC）
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
