# 📻 开黑电台 — 联机游戏语音频道 + 屏幕共享

自托管的联机游戏语音软件：**语音频道 + 屏幕共享 + 房间文字聊天**，Web 端即开即用，
可进一步打包为桌面应用。语音走 **WebRTC P2P（mesh）**，语音与屏幕画面不经过服务器；
服务器只做信令（房间/频道/成员状态/SDP-ICE 转发）。

> 技术选型与对标软件详见 [`docs/调研报告.md`](docs/调研报告.md)。

## 功能特性

- 🎙️ **语音频道**：房间（5 位邀请码）→ 多个语音频道，同频道即互通
- 🎤 **三种说话模式**：语音检测 VAD / 按键说话 PTT（默认空格）/ 自由麦
- 📊 **说话指示 & 音量表**：本地 VAD + 远端音量检测，说话时绿色光环
- 🔇 **麦克风 / 闭麦**：单独静音、完全闭麦（含不听远端）
- 🖥️ **屏幕共享**：共享整个屏幕 / 窗口 / 标签页，多人可同时共享
- 💬 **房间文字聊天**：便于发房号、协调
- 🔗 **邀请链接**：一键复制 `http://host:3000/?room=XXXXXX`
- 🌐 **跨平台**：Chrome/Edge 打开即用；支持局域网与公网（公网需 TURN）

## 快速开始

环境要求：Node.js ≥ 18。

```bash
npm install
npm start
```

打开浏览器访问 `http://localhost:3000`，输入昵称 → 创建/加入房间 → 点击左侧语音频道。
首次加入频道时浏览器会请求麦克风权限；拒绝也能以"收听模式"进频道。

> 多开测试：同一浏览器可用"无痕窗口"，或直接开两个浏览器/两台设备。

## 局域网使用（多台设备/手机）

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
│   ├── index.js          # 入口：静态服务 + /api/config + Socket.IO
│   ├── rooms.js          # 房间/频道状态管理（内存态）
│   └── signaling.js      # Socket.IO 事件处理
├── client/               # Web 客户端（原生 ES Modules，无构建步骤）
│   ├── index.html
│   ├── css/style.css     # 暗色主题
│   └── js/
│       ├── main.js       # 应用主控制器（状态/交互）
│       ├── signaling.js  # Socket.IO 客户端封装
│       ├── audio.js      # 麦克风/增益/VAD/音量表 (Web Audio API)
│       ├── webrtc.js     # P2P mesh（完美协商 + 屏幕共享重协商）
│       └── ui.js         # DOM 渲染
├── scripts/
│   ├── make-certs.js     # 自签名 HTTPS 证书
│   └── smoke-test.mjs    # 信令冒烟测试（12 项断言）
├── docs/调研报告.md       # 现有软件与开源库调研
└── 源文件/需求说明.md      # 需求文档
```

## 架构

```
浏览器A ══Socket.IO(信令)══▶ Node 服务器 ◀══Socket.IO══ 浏览器B
   │                                                  │
   └─────────── WebRTC P2P (Opus 语音 + 屏幕视频) ──────┘
```

- **媒体面**：WebRTC mesh，每人每频道一条 P2P 连接；语音/屏幕直连，服务器零媒体成本。
- **信令面**：Socket.IO 转发 SDP/ICE 与房间状态。
- **扩容路径**：频道 >8 人时替换为 mediasoup/LiveKit SFU（见调研报告路线图）。

## 测试

```bash
# 终端 1：启动服务器
npm start
# 终端 2：运行信令冒烟测试（12 项：建房/加房/频道/信令转发/状态同步/聊天/离房清理）
node scripts/smoke-test.mjs
```

## 已知限制

- mesh 模式适合 2~8 人频道；更大规模需 SFU。
- 严格 NAT 下需 TURN 才能互通（配置见上文）。
- 房间/频道状态为内存态：服务器重启即清空，后续可换 Redis 持久化。
- 当前未做账号/权限体系（管理员、踢人、锁定频道等为路线图项）。
