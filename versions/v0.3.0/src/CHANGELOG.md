# CHANGELOG

本项目遵循语义化版本（Semantic Versioning），版本号以根目录 `VERSION` 文件为唯一来源。
版本发布流程见 `VERSIONING.md`。

## [v0.3.0] - 2026-08-09

### 新增
- 顶部菜单栏统筹全部功能：语音 / 屏幕 / 房间 / 设置 / 帮助 五组下拉菜单
- 完整设置、快捷键说明、关于（版本号显示）三个面板；关于版本号读自 VERSION 单一来源
- 菜单与底部控制栏共用控制函数、状态实时同步；设置下拉即时生效（输入设备 / VAD 灵敏度 / 降噪）

### 修复
- 模态框 hidden 属性被 display:flex 覆盖导致设置/快捷键/关于默认弹出遮挡界面
- room:leave / channel:leave 处理器 ack 参数错位，离开房间/频道时服务器崩溃（ack is not a function）

## [v0.2.0] - 2026-08-09

### 新增
- Electron 桌面版：内嵌信令服务器、系统托盘、最小化到托盘、日志落盘（exe 旁 logs\）
- 便携版 / 安装版（NSIS）exe 构建，产物通过 GitHub Releases 发布
- `server/app.js` 可嵌入启动函数，CLI 入口 `server/index.js` 复用
- 零依赖图标生成脚本（`scripts/gen-icon.mjs`）与产物导出脚本（`scripts/export-electron.mjs`）
- 目录规范（参考 AgentFloat）：assets / build / installer / logs / versions + VERSION / VERSIONING.md

### 修复
- Electron 中 `session` 需在 `app.whenReady()` 后使用，避免桌面版启动静默失败

## [v0.1.0] - 2026-08-09

### 新增
- 首个可用版本：WebRTC mesh 语音频道 + 屏幕共享 + 房间文字聊天
- 三种说话模式：VAD / PTT（默认空格）/ 自由麦；说话指示与音量表
- Debug 版日志系统（work/error 双写落盘）与自包含导出包
- 局域网 HTTPS 自签名证书支持；公网 TURN 注入支持
