// preload.cjs — 渲染进程安全桥（contextIsolation 开启时暴露最小 API）
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gvDesktop', {
  // 检查更新 → { ok, current, latest, hasUpdate, url, notes, source, error, detail }
  checkUpdate: () => ipcRenderer.invoke('gv:check-update'),
  // 应用更新（下载 + 确认 + 静默安装 + 重启）
  applyUpdate: () => ipcRenderer.invoke('gv:apply-update'),
  // 打开 GitHub Releases 页
  openReleasePage: () => ipcRenderer.invoke('gv:open-release-page'),
  // 退出应用
  quit: () => ipcRenderer.send('gv:quit'),
  // 服务器设置（本机开服 / 连接远程）
  getServerConfig: () => ipcRenderer.invoke('gv:get-server-config'),
  setServerConfig: (cfg) => ipcRenderer.invoke('gv:set-server-config', cfg),
  // 更新进度/状态推送：cb({ stage })
  onUpdateProgress: (cb) => ipcRenderer.on('gv:update-progress', (_e, data) => cb(data)),
  // 启动时后台发现新版本：cb(result)
  onUpdateAvailable: (cb) => ipcRenderer.on('gv:update-available', (_e, data) => cb(data)),
});
