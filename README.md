# 🖥️ GinyScreen — 一起看屏幕

> **专注屏幕共享的联机小工具**：房间里谁都能开播，其他人跟着看——一起看视频、电影、游戏画面。
> 桌面版为 **Windows exe**（内嵌服务器，无需安装 Node.js）；也可浏览器版直连。
> 画面走 **WebRTC P2P（mesh）**，屏幕画面**不经过服务器**，服务器只做信令转发。

![形态](https://img.shields.io/badge/形态-Web%20%2B%20Electron-blue) ![平台](https://img.shields.io/badge/平台-Windows%20%2F%20macOS%20%2F%20Linux-lightgrey) ![版本](https://img.shields.io/badge/版本-v1.0.0-green) ![技术](https://img.shields.io/badge/技术-WebRTC%20%2B%20Node.js-orange)

---

## ✨ 功能特点

| 类别 | 能力 |
|------|------|
| 🖥️ 屏幕共享 | 共享整屏 / 窗口 / 标签页，**支持系统声音**（一起看视频必备） |
| 🎬 画质预设 | 文字优先（清晰）/ 平衡 / 流畅（高帧率），**共享中可实时切换** |
| 🧑‍🤝‍🧑 多人共享 | 房间内谁都能开播，多人同时共享时多宫格展示，**点击聚焦**大屏 |
| 🎞️ 影院式 UI | 深色大屏舞台 + 左侧成员列表 + 底部控制栏，专注观看 |
| 🔗 房间系统 | 5 位邀请码，一键复制邀请链接，双击即进 |
| 🌐 跨网络 | 蒲公英 / 米西 / ZeroTier 组网，或 SakuraFrp 内网穿透（见文档） |
| 🖧 服务器设置 | 本机开服 / 连接朋友的服务器，一键切换并自动重启 |
| 🔄 自动更新 | 安装版支持自动检查 + 静默升级（国内代理加速） |
| 📋 Debug 版 | 每次迭代发布带控制台 + 日志 + DevTools 的调试 exe |

> 🚫 **没有语音**：GinyScreen 专注屏幕共享，不包含麦克风通话与文字聊天（看视频建议用第三方语音软件，或共享时用系统声音）。

---

## 🚀 快速开始（浏览器版）

**环境要求**：Node.js ≥ 18。

```bash
npm install
npm start
```

打开浏览器访问 `http://localhost:3000`：

1. 输入昵称 → **创建房间**（或输入好友的房间号 → **加入房间**）
2. 点底部 **「🖥️ 共享屏幕」** → 选择要共享的整屏 / 窗口 / 标签页
3. 想看视频？先勾选 **「同时共享系统声音」**，声音会随画面一起传给队友
4. 其他成员进入房间后即可看到你的画面；**双击/点击小窗**可聚焦某一画面

> 💡 多开测试：同一浏览器用**无痕窗口**，或直接开两个浏览器。
> 共享前建议在浏览器地址栏点击「共享屏幕」授权；拒绝后无法采集。

---

## 🎥 用 OBS 共享合成画面（可选）

想共享「OBS 合成画面」（游戏 + 摄像头画中画 + 弹幕/字幕），无需开两个窗口：

1. 在 OBS 中：添加游戏/窗口来源 → 点击底部 **启动虚拟摄像头**（工具 → 虚拟摄像头）
2. 在 GinyScreen 里点「共享屏幕」→ 选择 **OBS Virtual Camera** 作为摄像头来源
3. 若用「窗口」方式共享 OBS 主窗口，记得勾选 **系统声音**，声音一起传

---

## 🖥️ 桌面版（Windows exe）

桌面版 = **内嵌服务器 + 主窗口 + 系统托盘**，不需要安装 Node.js，双击即用。

### 三种形态

| 形态 | 文件 | 说明 |
|------|------|------|
| 🐞 Debug 版 | `GinyScreen-Debug-vX.Y.Z.exe` | 每次迭代发布，带实时日志控制台 + DevTools，用于试用/报障 |
| 🧳 便携版 | `GinyScreen-Portable-vX.Y.Z.exe` | 免安装，双击即用，绿色便携 |
| 📦 安装版 | `GinyScreen-Setup-vX.Y.Z.exe` | NSIS 安装器，可选安装目录，支持自动更新 |

- **日志位置**：exe 旁 `logs\`（工作日志 `work-日期.log` / 报错日志 `error-日期.log` / 崩溃报告 `crash_*.txt`）
- **托盘**：关闭窗口最小化到托盘，托盘菜单可“打开主界面 / 复制访问地址 / 退出”
- **退出**：托盘右键 → 退出，或应用内 帮助 → 退出 GinyScreen；点窗口 × 只是最小化到托盘
- **下载**：最新版见 [GitHub Releases](https://github.com/GinyvaXu/GinyScreen/releases)

### 🔄 自动更新（安装版）

1. 启动时后台自动检查新版本，发现更新会在界面提示
2. 也可手动：**帮助 → 检查更新**
3. 点击“立即更新”→ 自动下载安装包 → 程序关闭并静默升级 → 自动重启

> 便携版暂不支持自更新（运行中的 exe 无法被替换），会引导你到 Releases 页手动下载。
> 更新清单 `update.json` 随仓库推送；检查走多个源（raw GitHub / 国内加速代理 / jsDelivr / Releases API），国内网络友好。

---

## 🌐 局域网使用（多台设备 / 手机）

浏览器要求**安全上下文**（HTTPS 或 localhost）才能使用屏幕采集。局域网其他设备访问需：

```bash
npm run certs      # 生成自签名证书（需 openssl，Git for Windows 自带）
HTTPS=1 npm start  # 启动 HTTPS
```

其他设备访问 `https://<你的电脑局域网IP>:3000`，首次需在浏览器中信任自签名证书。

## 🌐 跨网络联机（零成本）

> 适用：固定朋友开黑、不在同一局域网、不想花钱租服务器。
> 两种思路任选：**组网（虚拟局域网，画面最稳）** 或 **内网穿透（只有开服者要装）**。都通过「帮助 → 服务器设置」填写/展示服务器地址。
> 完整图文教程（SakuraFrp 穿透 / 蒲公英·米西·ZeroTier 组网）：[docs/fri-network.md](docs/fri-network.md)

### 方案一：组网（推荐）

任选一个虚拟组网工具，**所有人**装好并加入同一网络；开服者在 GinyScreen「帮助 → 服务器设置」勾选「本机开服」，把「本机可访问地址」里的**虚拟 IP** 发给好友；好友勾选「连接朋友的服务器」填入 → 保存并重启。

| 工具 | 免费额度 | 说明 |
|------|---------|------|
| 蒲公英（贝锐） | 3 台设备 | 国内服务稳定，免费限速 1~2 Mbps，看视频画面够用 |
| 米西开黑 | 免费 | P2P 低延迟组网，自带语音/屏幕（也可只用来组网跑 GinyScreen） |
| ZeroTier | 免费 | 国际服务，国内偶尔不稳 |

### 方案二：内网穿透（SakuraFrp，好友零安装）

1. 注册 [SakuraFrp](https://www.natfrp.com/)（需实名），创建一条 **TCP 隧道** 映射本机 **3000** 端口
2. 启动隧道，得到公网地址（形如 `123.45.67.89:23456`；可绑定域名开启 HTTPS）
3. 把该地址发给好友：好友在「帮助 → 服务器设置」→「连接朋友的服务器」填入 → 保存并重启
4. 只有开服者需要装 SakuraFrp；隧道是出站连接，Windows 防火墙无需额外放行

> ⚠️ 内网穿透只解决「找到服务器」；屏幕画面是 WebRTC P2P 直连**不走隧道**。家庭宽带多数能打洞成功；
> 若双方网络严格（校园网/公司网）可能连不上画面——遇到这种情况改用方案一组网即可。

### IPv6 直连（免装软件）

国内运营商宽带大多已分配公网 IPv6。双方都有 IPv6 时，开服者把 `http://[IPv6地址]:3000` 发给好友即可直连（服务器已默认双栈监听）。

---

## 🔨 构建与发布

版本号**唯一来源**是根目录 `VERSION` 文件，构建脚本自动同步到 package.json。

| 命令 | 产物 | 用途 |
|------|------|------|
| `npm run dist:debug` | `build/debug/GinyScreen-Debug-vX.Y.Z.exe` | **每次迭代必出**，供试用/报障 |
| `npm run dist:portable` | `build/GinyScreen-Portable-vX.Y.Z.exe` | 功能验证通过后发布 |
| `npm run dist:installer` | `build/GinyScreen-Setup-vX.Y.Z.exe` | 功能验证通过后发布 |
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
GinyScreen/
├── server/                # 信令服务器 (Node.js + Express + Socket.IO)
│   ├── index.js           # CLI 入口（npm start）
│   ├── app.js             # 可嵌入启动函数（CLI 与桌面版共用）
│   ├── rooms.js           # 房间/成员/共享状态管理（内存态）
│   ├── signaling.js       # Socket.IO 事件处理
│   └── logger.js          # Debug 版日志（work/error 落盘 + 崩溃报告）
├── client/                # Web 客户端（原生 ES Modules，无构建步骤）
│   ├── index.html         # 影院式 UI（大厅 + 房间）
│   ├── css/style.css      # 深色主题
│   └── js/                # main.js / signaling.js / screenshare.js / webrtc.js / ui.js
├── desktop/               # Electron 桌面壳（内嵌服务器 + 托盘 + 自动更新）
│   ├── main.js            # 主进程（日志/托盘/Debug 控制台/更新 IPC）
│   ├── preload.cjs        # 渲染进程安全桥
│   └── updater.js         # 自动更新（多源清单 + 静默安装）
├── assets/                # 应用图标（icon.png / icon.ico / tray.png）
├── scripts/               # 构建/测试/导出/归档脚本
├── docs/                  # 调研报告 / 网络架构 / 联机方案(fri-network) / 功能差距 / 技术路线
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
共享者 PC ──Socket.IO(信令)──► Node 服务器 ◄──Socket.IO(信令)── 观看者 PC
   │                                                        │
   └──────────── WebRTC P2P (屏幕画面 + 系统声音) ───────────┘
```

- **媒体面**：WebRTC mesh，共享者与每位观看者一条 P2P 连接；画面/声音直连，服务器零媒体成本，DTLS-SRTP 端到端加密
- **信令面**：Socket.IO 转发 SDP/ICE 与房间/共享状态；服务器不接触媒体内容
- **画质**：预设档（文字优先/平衡/流畅）+ `maintain-resolution` 降级策略（拥塞时降帧不降清晰度）+ 码率上限控制上行
- **扩展路径**：观看人数 >8 时替换为 mediasoup / LiveKit SFU（信令协议不变）

完整信令/媒体链路解读：[docs/network-architecture.md](docs/network-architecture.md)

---

## 🧪 测试

```bash
# 终端 1：启动服务器
npm start

# 终端 2：运行信令冒烟测试（11 项断言）
node scripts/smoke-test.mjs
```

---

## 🧭 已知限制与路线图

- **规模**：mesh 模式适合 2~4 人共享/观看；更多人需 SFU（方案见 [docs/tech-alternatives.md](docs/tech-alternatives.md)）
- **NAT**：严格 NAT 下需 TURN 才能互通（配置见 README「进阶」）
- **持久化**：房间/状态为内存态，服务器重启即清空
- **权限**：暂无房主权限体系（踢人、锁房间为路线图项）
- **远程控制**：暂不支持「帮朋友操作电脑」（后续可评估 WebRTC data channel + 虚拟输入）

---

## 🙏 参考项目与调研

- 调研报告（现有屏幕共享/语音软件对比 + 开源库）：[docs/research-report.md](docs/research-report.md)
- 参考的同类开源项目：Mumble/Murmur、Galène、LiveKit、mediasoup、OBS、Discord 直播；自动更新思路参考诺丁汉桌游项目（多源清单 + 静默重装）

---

## 📜 版本历史

| 版本 | 说明 |
|------|------|
| v1.0.0 | **全面重做 GinyScreen**：移除语音通话，专注屏幕共享；影院式深色 UI；画质预设 + 系统声音；多人轮流共享；房间/成员/共享信令重构；GitHub 仓库更名 |
| v0.6.0 | 跨网络联机：服务器设置（本机开服/连朋友）、双栈监听、SakuraFrp 穿透 + 蒲公英/米西/ZeroTier 组网、打洞失败诊断（GinyVoC 时代） |
| v0.5.1 | 修复 VAD 死锁（麦克风不工作）+ 本地音量反馈；托盘退出修复；频道双击进入；应用内退出（GinyVoC 时代） |
| v0.5.0 | 菜单裁剪修复；音频输入显性化 + 输出设备切换；屏幕共享支持 OBS 虚拟摄像头与系统声音；设置持久化（GinyVoC 时代） |
| v0.4.0 | 更名 GinyVoC；Debug 版 exe 构建流程；自动更新；菜单/弹窗修复；产物全英文命名 |
| v0.3.0 | 顶部菜单栏统筹全部功能；完整设置/快捷键/关于面板；弹窗遮挡修复 |
| v0.2.0 | Electron 桌面版（内嵌服务器/托盘/日志）；便携版 + 安装版构建 |
| v0.1.0 | 首个可用版本：WebRTC mesh 语音 + 屏幕共享 + 文字聊天（GinyVoC 前身） |