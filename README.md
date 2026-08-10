# 📻 GinyVoC — 联机游戏语音频道 · 屏幕共享

> **自托管的联机游戏语音软件**：语音频道 + 屏幕共享 + 房间文字聊天，一个软件全搞定。
> 浏览器版**即开即用**，桌面版为 **Windows exe**（内嵌服务器，无需安装 Node.js）。
> 语音走 **WebRTC P2P（mesh）**，语音与屏幕画面**不经过服务器**，服务器只做信令转发。

![形态](https://img.shields.io/badge/形态-Web%20%2B%20Electron-blue) ![平台](https://img.shields.io/badge/平台-Windows%20%2F%20macOS%20%2F%20Linux-lightgrey) ![版本](https://img.shields.io/badge/版本-v0.6.0-green) ![技术](https://img.shields.io/badge/技术-WebRTC%20%2B%20Node.js-orange)

---

## ✨ 功能特点

| 类别 | 能力 |
|------|------|
| 🎙️ 语音频道 | 房间（5 位邀请码）→ 多个语音频道，同频道即互通 |
| 🎤 说话模式 | 语音检测 VAD / 按键说话 PTT（默认空格）/ 自由麦，三种一键切换 |
| 🎧 状态反馈 | 自己与他人均有说话光环 + 实时音量条 + 成员列表同步 |
| 🔇 静音控制 | 单独静音麦克风、完全闭麦（不听也不说） |
| 🖥️ 屏幕共享 | 共享整屏 / 窗口 / 标签页，或 **OBS 虚拟摄像头**；可附带系统声音一起看视频 |
| 💬 文字聊天 | 房间内文字聊天，方便发房号、协调 |
| 🎛️ 音频设置 | 语音菜单直达输入/输出设备切换，设置自动记忆 |
| 🔗 邀请链接 | 一键复制 `http://host:3000/?room=XXXXXX` |
| ⚙️ 完整设置 | 输入/输出设备、VAD 灵敏度、降噪/回声消除、自定义 PTT 按键 |
| 🧭 统筹菜单 | 顶部菜单栏统筹全部功能（语音/屏幕/房间/设置/帮助） |
| 🔄 自动更新 | 安装版支持自动检查 + 静默升级（国内代理加速） |
| 📋 Debug 版 | 每次迭代发布带控制台 + 日志 + DevTools 的调试 exe |

---

## 🚀 快速开始（浏览器版）

**环境要求**：Node.js ≥ 18。

```bash
npm install
npm start
```

打开浏览器访问 `http://localhost:3000`：

1. 输入昵称 → **创建房间**（或输入好友的房间号 → **加入房间**）
2. 点击左侧语音频道 → 浏览器请求麦克风权限 → 允许
3. 开始说话！底部控制栏可切换 VAD / PTT / 自由麦、共享屏幕

> 💡 多开测试：同一浏览器用**无痕窗口**，或直接开两个浏览器、两台设备。
> 首次进入频道时浏览器会请求麦克风权限；拒绝也能以“收听模式”进频道。

---

## 🎥 用 OBS 共享画面（可选）

想共享「OBS 合成画面」（游戏 + 摄像头画中画 + 弹幕/字幕），无需开两个窗口：

1. 在 OBS 中：添加游戏/窗口来源 → 点击底部 **启动虚拟摄像头**（工具 → 虚拟摄像头）
2. 在 GinyVoC **屏幕菜单** → 共享来源选择 **OBS 虚拟摄像头**
3. 点 **共享屏幕**，即可把 OBS 输出共享给频道里的队友

> 🎬 一起看视频/电影：勾选 **同时共享系统声音**，再按提示选择一次 OBS 正在采集的窗口，声音就会随画面一起传给队友。

---

## 🖥️ 桌面版（Windows exe）

桌面版 = **内嵌服务器 + 主窗口 + 系统托盘**，不需要安装 Node.js，双击即用。

### 三种形态

| 形态 | 文件 | 说明 |
|------|------|------|
| 🐞 Debug 版 | `GinyVoC-Debug-vX.Y.Z.exe` | 每次迭代发布，带实时日志控制台 + DevTools，用于试用/报障 |
| 🧳 便携版 | `GinyVoC-Portable-vX.Y.Z.exe` | 免安装，双击即用，绿色便携 |
| 📦 安装版 | `GinyVoC-Setup-vX.Y.Z.exe` | NSIS 安装器，可选安装目录，支持自动更新 |

- **日志位置**：exe 旁 `logs\`（工作日志 `work-日期.log` / 报错日志 `error-日期.log` / 崩溃报告 `crash_*.txt`）
- **托盘**：关闭窗口最小化到托盘，托盘菜单可“打开主界面 / 复制访问地址 / 退出”
- **退出**：托盘右键 → 退出，或应用内 帮助 → 退出 GinyVoC；点窗口 × 只是最小化到托盘
- **下载**：最新版见 [GitHub Releases](https://github.com/GinyvaXu/ginyvoc/releases)

### 🔄 自动更新（安装版）

1. 启动时后台自动检查新版本，发现更新会在界面提示
2. 也可手动：**帮助 → 检查更新**
3. 点击“立即更新”→ 自动下载安装包 → 程序关闭并静默升级 → 自动重启

> 便携版暂不支持自更新（运行中的 exe 无法被替换），会引导你到 Releases 页手动下载。
> 更新清单 `update.json` 随仓库推送；检查走多个源（raw GitHub / 国内加速代理 / jsDelivr / Releases API），国内网络友好。

---

## 🌐 局域网使用（多台设备 / 手机）

浏览器要求**安全上下文**（HTTPS 或 localhost）才能使用麦克风。局域网其他设备访问需：

```bash
npm run certs      # 生成自签名证书（需 openssl，Git for Windows 自带）
HTTPS=1 npm start  # 启动 HTTPS
```

其他设备访问 `https://<你的电脑局域网IP>:3000`，首次需在浏览器中信任自签名证书。

## 🌐 跨网络联机（零成本，推荐组网）

> 适用：固定朋友开黑、不在同一局域网、不想花钱租服务器。
> 思路：用 **ZeroTier 等虚拟组网**把大家放进同一个「虚拟局域网」，由其中一人**本机开服**，其他人连他的虚拟网地址——信令和语音都在虚拟网内直连，完全免费、不需要 TURN。

### 方法一：ZeroTier 组网（推荐）

1. 所有人都安装 [ZeroTier](https://www.zerotier.com/download/) 并注册登录
2. 一人创建 Network（网络 ID 形如 `abcd1234ef123456`），其余人加入同一网络并在网页后台批准
3. 开服的人：运行 GinyVoC → **帮助 → 服务器设置** → 勾选「本机开服」，把「本机可访问地址」（如 `http://10.147.x.x:3000`）发给好友
4. 好友：**帮助 → 服务器设置** → 勾选「连接朋友的服务器」→ 填入地址 → 保存并重启

### 方法二：IPv6 直连（免装软件）

国内运营商宽带大多已分配公网 IPv6。双方都有 IPv6 时，开服的人把 `http://[IPv6地址]:3000` 发给好友即可直连（服务器已默认双栈监听）。

### 防火墙

开服前请在 Windows 防火墙允许 GinyVoC 通过（或放行 TCP/UDP 3000 端口），否则好友连不上。

### 有公网 IP / VPS 时（进阶）

1. 服务器部署到公网 VPS（开放 3000 端口）
2. 严格 NAT 下 P2P 打洞失败时配置 TURN 兜底：

```bash
TURN_URL=turn:你的turn域名:3478 TURN_USER=xxx TURN_PASS=yyy npm start
```

---

## 🔨 构建与发布

版本号**唯一来源**是根目录 `VERSION` 文件，构建脚本自动同步到 package.json。

| 命令 | 产物 | 用途 |
|------|------|------|
| `npm run dist:debug` | `build/debug/GinyVoC-Debug-vX.Y.Z.exe` | **每次迭代必出**，供试用/报障 |
| `npm run dist:portable` | `build/GinyVoC-Portable-vX.Y.Z.exe` | 功能验证通过后发布 |
| `npm run dist:installer` | `build/GinyVoC-Setup-vX.Y.Z.exe` | 功能验证通过后发布 |
| `npm run finalize` | 复制 exe 到 `installer\` | 交付归档 |
| `npm run archive` | 归档到 `versions/vX.Y.Z/` | 版本归档（源码快照 + 产物） |
| `npm run icon` | 重新生成图标 | 换肤时使用 |

```bash
# 从源码构建 exe（以 debug 版为例）
npm install
npm run icon            # 生成 assets 图标
npm run dist:debug      # 构建 Debug 版 → build/debug/
```

> 分支模型：日常开发在 `develop`，`main` 只接受 `develop` 的合并（--no-ff），每个节点对应一个已发布版本。
> 完整发布流程见 `VERSIONING.md`。

---

## 📁 项目结构

```
GinyVoC/
├── server/                # 信令服务器 (Node.js + Express + Socket.IO)
│   ├── index.js           # CLI 入口（npm start）
│   ├── app.js             # 可嵌入启动函数（CLI 与桌面版共用）
│   ├── rooms.js           # 房间/频道状态管理（内存态）
│   ├── signaling.js       # Socket.IO 事件处理
│   └── logger.js          # Debug 版日志（work/error 落盘 + 崩溃报告）
├── client/                # Web 客户端（原生 ES Modules，无构建步骤）
│   ├── index.html
│   ├── css/               # style.css / menu.css
│   └── js/                # main.js / signaling.js / audio.js / webrtc.js / ui.js
├── desktop/               # Electron 桌面壳（内嵌服务器 + 托盘 + 自动更新）
│   ├── main.js            # 主进程（日志/托盘/Debug 控制台/更新 IPC）
│   ├── preload.cjs        # 渲染进程安全桥
│   └── updater.js         # 自动更新（多源清单 + 静默安装）
├── assets/                # 应用图标（icon.png / icon.ico / tray.png）
├── scripts/               # 构建/测试/导出/归档脚本
├── docs/                  # 调研报告 / 网络连接实现 / 功能差距 / 技术路线对比
├── source/                # 需求文档
├── build/                 # 构建产物（electron-builder 输出，不入库）
├── installer/             # 交付 exe（不入库，走 GitHub Releases）
├── release/               # 浏览器版 Debug 导出包（不入库）
├── versions/              # 版本归档（vX.Y.Z/src 入库，dist/installer 不入库）
├── logs/                  # 桌面版运行日志（不入库）
├── update.json            # 自动更新清单（版本/下载地址/更新说明）
├── VERSION                # 当前版本（唯一版本来源）
├── VERSIONING.md          # 版本管理规范
├── CHANGELOG.md           # 变更记录
└── AGENTS.md              # 项目规则（Codex 自动读取）
```

---

## 🏗️ 架构

```
浏览器A ⇄ Socket.IO(信令) ⇄  Node 服务器 ⇄ Socket.IO ⇄ 浏览器B
   │                                                │
   └────────── WebRTC P2P (Opus 语音 + 屏幕视频) ───┘
```

- **媒体面**：WebRTC mesh，每人每频道一条 P2P 连接；语音/屏幕直连，服务器零媒体成本，DTLS-SRTP 端到端加密
- **信令面**：Socket.IO 转发 SDP/ICE 与房间状态；服务器不接触媒体内容
- **扩展路径**：频道 >8 人时替换为 mediasoup / LiveKit SFU（信令协议不变）

完整信令/媒体链路解读：[docs/network-architecture.md](docs/network-architecture.md)

---

## 🧪 测试

```bash
# 终端 1：启动服务器
npm start

# 终端 2：运行信令冒烟测试（12 项断言）
node scripts/smoke-test.mjs
```

功能差距分析与可用性核验：[docs/gap-analysis.md](docs/gap-analysis.md)

---

## 🧭 已知限制与路线图

- **规模**：mesh 模式适合 2~8 人频道；更大规模需 SFU（方案见 [docs/tech-alternatives.md](docs/tech-alternatives.md)）
- **NAT**：严格 NAT 下需 TURN 才能互通（配置见上方）
- **持久化**：房间/频道状态为内存态，服务器重启即清空
- **权限**：暂无账号/房主权限体系（踢人、禁言、锁频道为路线图项）
- **重连**：断线暂不自动重连回频道

优先级建议见 [docs/gap-analysis.md](docs/gap-analysis.md) 第二节。

---

## 🙏 参考项目与调研

调研报告（现有语音软件对比 + 开源库）：[docs/research-report.md](docs/research-report.md)

参考的同类开源项目：Mumble/Murmur、Galène、harmony-server、backspace、gitcord、IceVox、Squawk；自动更新思路参考诺丁汉桌游项目（多源清单 + 静默重装）。

---

## 📜 版本历史

| 版本 | 说明 |
|------|------|
| v0.6.0 | 跨网络联机：服务器设置（本机开服/连朋友）、双栈监听、ZeroTier/IPv6 直连方案 |
| v0.5.1 | 修复 VAD 死锁（麦克风不工作）+ 本地音量反馈；托盘退出修复；频道双击进入；应用内退出 |
| v0.5.0 | 菜单裁剪修复（五组菜单真实可用）；音频输入显性化 + 输出设备切换；屏幕共享支持 OBS 虚拟摄像头与系统声音；设置持久化 |
| v0.4.0 | 更名 GinyVoC；Debug 版 exe 构建流程；自动更新；菜单/弹窗修复；产物全英文命名 |
| v0.3.0 | 顶部菜单栏统筹全部功能；完整设置/快捷键/关于面板；弹窗遮挡修复 |
| v0.2.0 | Electron 桌面版（内嵌服务器/托盘/日志）；便携版 + 安装版构建 |
| v0.1.0 | 首个可用版本：WebRTC mesh 语音 + 屏幕共享 + 文字聊天 |
