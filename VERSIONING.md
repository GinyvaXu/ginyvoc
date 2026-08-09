# 版本管理规范 — 开黑电台

## 版本号制度
采用**语义化版本 (Semantic Versioning)**：
```
v<MAJOR>.<MINOR>.<PATCH>

MAJOR — 重大架构变更或不兼容的 API 改动
MINOR — 新功能、优化（向后兼容）
PATCH — Bug 修复、安全补丁
```

## 构建与归档流程
1. 更新 `VERSION` 与 `package.json` 的 version；
2. 构建：`npm run icon` → `npm run dist:portable` / `npm run dist:installer` → `npm run finalize`（复制到 `installer\`）；
3. 旧版本归档：移到 `versions\vX.Y.Z\`（本地保留，不上传）；
4. 正式发布：通过 GitHub Releases 上传 `installer\` 下的 exe。

## 版本历史

| 版本 | 说明 |
|------|------|
| v0.2.0 | 新增 Electron 桌面版：内嵌信令服务器、系统托盘、最小化到托盘、日志落盘；新增便携版 / 安装版 exe 构建；新增 `assets` 图标与 `build/installer/versions` 目录规范 |
| v0.1.0 | 首个可用版本：WebRTC mesh 语音 + 屏幕共享 + 文字聊天；Debug 版日志系统与自包含导出包 |
