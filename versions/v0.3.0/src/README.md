# 📻 开黑电台 — 联机游戏语音频道 + 屏幕共享

自托管的联机游戏语音软件：**语音频道 + 屏幕共享 + 房间文字聊天**。
提供两种形态：**浏览器版**（Web 端即开即用）与 **桌面版**（Windows exe）。
语音走 **WebRTC P2P（mesh）**，语音与屏幕画面不经过服务器；服务器只做信令（房间/频道/成员状态、SDP/ICE 转发）。

> 技术选型与对标软件调研见 [`docs/调研报告.md`](docs/调研报告.md)。

## 功能特点
- 🎙️ **语音频道**：房间（5 位邀请码）→ 多个语音频道，同频道即互通
- 🎤 **三种说话模式**：语音检测 VAD / 按键说话 PTT（默认空格）/ 自由麦
- 🎧 **说话指示 & 音量表**：本地 VAD + 远端音量检测，说话时绿色光环
- 🔇 **麦克风 / 闭麦**：单独静音、完全闭麦（含不听远端）
- 🖥️ **屏幕共享**：共享整个屏幕 / 窗口 / 标签页，多人可同时共享
- 💬 **房间文字聊天**：方便发房号、协调
- 🔗 **邀请链接**：一键复制 `http://host:3000/?room=XXXXXX`
- 🌐 **跨平台**：Chrome/Edge 打开即用；桌面版为 Windows exe；支持局域网与公网（公网需 TURN）

## 快速开始（浏览器版）
环境要求：Node.js ≥ 18。

```bash
npm install
npm start
```

打开浏览器访问 `http://localhost:3000`，输入昵称 → 创建/加入房间 → 点击左侧语音频道。
首次加入频道时浏览器会请求麦克风权限；拒绝也能以"收听模式"进频道。

> 多开测试：同一浏览器可用"无痕窗口"，或直接开两个浏览器、两台设备。

## 桌面版（Windows exe）
桌面版 = 内嵌服务器 + 主窗口 + 系统托盘，**不需要安装 Node.js**，双击即用。

### 已构建产物
- `installer/开黑电台-便携版-v0.2.0.exe` — 便携版，双击直接运行（免安装）
- `installer/开黑电台-安装版-v0.2.0.exe` — 安装版（NSIS，可选安装目录）

日志写在 exe 旁 `logs\`（工作日志 `work-日期.log` / 报错日志 `error-日期.log`）。
关闭窗口会最小化到托盘，托盘菜单可退出。

### 从源码构建 exe
```bash
npm install
npm run icon            # 生成 assets 图标
npm run dist:portable   # 构建便携版 → build\（构建前自动从 VERSION 同步版本号）
npm run dist:installer  # 构建安装版 → build\
npm run finalize        # 复制 exe 到 installer\
```

## 局域网使用（多台设备 / 手机）
浏览器要求**安全上下文**（HTTPS 或 localhost）才能用麦克风。局域网其他设备访问需：

```bash
npm run certs      # 生成自签名证书（需 openssl，Git for Windows 自带）
HTTPS=1 npm start  # 启动 HTTPS
```

其他设备访问 `https://<你电脑的局域网IP>:3000`，首次需在浏览器中信任自签名证书。

## 公网使用
1. 服务器部署到公网 VPS（开放 3000 端口）；
2. 配置 TURN 服务器（严格 NAT 下 P2P 打洞失败时兜底）：

```bash
TURN_URL=turn:你的turn域名:3478 TURN_USER=xxx TURN_PASS=yyy npm start
```

## 项目结构

```
项目13-软件-开黑电台/
├── server/               # 信令服务器 (Node.js + Express + Socket.IO)
│   ├── index.js          # CLI 入口（npm start）
│   ├── app.js            # 可嵌入启动函数（CLI 与桌面版共用）
│   ├── rooms.js          # 房间/频道状态管理（内存态）
│   ├── signaling.js      # Socket.IO 事件处理
│   └── logger.js         # Debug 版日志（work/error 落盘）
├── client/               # Web 客户端（原生 ES Modules，无构建步骤）
│   ├── index.html
│   ├── css/style.css
│   └── js/               # main.js / signaling.js / audio.js / webrtc.js / ui.js
├── desktop/              # Electron 桌面壳（内嵌服务器 + 托盘）
│   └── main.js
├── assets/               # 应用图标（icon.png / icon.ico / tray.png）
├── scripts/
│   ├── make-certs.js        # 自签名 HTTPS 证书
│   ├── smoke-test.mjs       # 信令冒烟测试（12 项断言）
│   ├── gen-icon.mjs         # 生成图标
│   ├── sync-version.mjs     # 从 VERSION 同步 package.json 版本号
│   ├── export-electron.mjs  # 复制 exe 到 installer\
│   └── export-debug.mjs     # 导出浏览器版自包含包（Debug）
├── docs/调研报告.md         # 现有软件与开源库调研
├── docs/网络连接实现.md      # 网络连接实现说明
├── 源文件/需求说明.md        # 需求文档
├── build/                # 构建中间产物（electron-builder 输出，不入库）
├── installer/            # 交付：便携版/安装版 exe（不入库，走 Releases）
├── logs/                 # 桌面版开发运行日志（不入库）
├── versions/             # 版本归档：vX.Y.Z/src 源码快照入库，dist/installer 不入库
├── 成品/                 # 浏览器版 Debug 导出包（不入库）
├── 中间产物/             # 证书等中间文件（不入库）
├── VERSION               # 当前版本（唯一版本来源）
├── VERSIONING.md         # 版本管理规范
├── CHANGELOG.md          # 变更记录
└── AGENTS.md             # 项目规则（Codex 自动读取）
```

## 开发流程（分支与发布）

- 分支模型：日常开发在 `develop`；`main` 只接受 `develop` 的合并（--no-ff），每个节点对应一个已发布版本
- 版本号：只改 `VERSION` 文件，构建脚本自动同步；变更记录写 `CHANGELOG.md`
- 完整发布流程与提交规范：见 `VERSIONING.md`

## 架构

```
浏览器A ⇄ Socket.IO(信令) ⇄  Node 服务器 ⇄ Socket.IO ⇄ 浏览器B
   │                                                │
   └────────── WebRTC P2P (Opus 语音 + 屏幕视频) ───┘
```

- **媒体面**：WebRTC mesh，每人每频道一条 P2P 连接；语音/屏幕直连，服务器零媒体成本。
- 完整信令/媒体链路解读见 [docs/网络连接实现.md](docs/网络连接实现.md)。
- **信令面**：Socket.IO 转发 SDP/ICE 与房间状态。
- **扩展路径**：频道 >8 人时替换为 mediasoup/LiveKit SFU（见调研报告路线图）。

## 测试

```bash
# 终端 1：启动服务器
npm start
# 终端 2：运行信令冒烟测试（12 项：建房/加房/频道/信令转发/状态同步/聊天/离房清理）
node scripts/smoke-test.mjs
```

## 已知限制
- mesh 模式适合 2~8 人频道；更大规模需 SFU。
- 严格 NAT 下需 TURN 才能互通（配置见上方）。
- 房间/频道状态为内存态：服务器重启即清空，后续可换 Redis 持久化。
- 当前未做账号/权限体系（管理员、踢人、锁定频道等为路线图项）。
