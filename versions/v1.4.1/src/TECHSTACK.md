# 技术栈 — GinyScreen（一起看屏幕）

## 概览
| 维度 | 内容 |
|------|------|
| 语言/运行时 | Node.js ≥ 18（服务端 + Electron 桌面） |
| 主要框架 | Express + Socket.IO（信令）+ WebRTC（P2P）+ Electron |
| 数据存储 | 无持久化（单房间内存态） |
| 前端 | 原生 HTML/CSS/JS 单页（WebRTC 客户端） |
| 构建与打包 | electron-builder（便携/NSIS 安装版）+ 自研 Debug 构建脚本 |
| 测试 | node 冒烟测试脚本（scripts/smoke-test.mjs） |

## 核心功能实现
### 屏幕共享与系统声音
- **实现逻辑**：共享者用浏览器/Electron 的屏幕采集接口选择整屏/窗口/标签页，勾选后同时采集系统声音；画面经 WebRTC 直接 P2P 传输给房间成员，服务器只转发信令、不经过媒体流。
- **技术手段**：`navigator.mediaDevices.getDisplayMedia` + WebRTC `RTCPeerConnection`（mesh 拓扑）；系统声音通过采集约束开启 audio track，保证「一起看视频」的音画同步。
### 信令与房间管理
- **实现逻辑**：单服务器单房间模型——主机自选端口开房，好友首页直接填 IP:端口 加入；多人共享时多宫格展示、点击聚焦；成员状态（加入/离开/共享中）实时同步。
- **技术手段**：Socket.IO 事件驱动（offer/answer/ICE candidate 转发 + 房间状态广播）；rooms.js 维护成员表，signaling.js 负责协商消息透传；express 托管静态客户端。
### 桌面版（Electron 壳）
- **实现逻辑**：Windows exe 内嵌 Node 服务器 + 主窗口 + 系统托盘，用户无需安装 Node.js；Debug 版带控制台与 DevTools。
- **技术手段**：Electron `desktop/main.js` 启动内嵌 server 并打开窗口，`preload.cjs` 安全桥接；electron-builder 产出 portable 与 NSIS 安装版，版本号由 scripts/sync-version.mjs 从 VERSION 同步。
### 自动更新
- **实现逻辑**：安装版启动后并行拉取 GitHub 多镜像源的 update.json 清单（ghfast/ghproxy/jsdelivr/GitHub API），对比版本后静默下载安装包并引导升级。
- **技术手段**：Electron `fetch` + AbortController 超时控制多源竞速；清单文件随 git 推送仓库根目录；NSIS 安装版支持覆盖安装。
