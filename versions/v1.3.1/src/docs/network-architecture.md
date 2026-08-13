> 📦 本文档为 **GinyVoC（v0.6.0 及以前）** 时代的调研/分析存档。GinyScreen v1.0.0 已移除语音通话，专注屏幕共享，内容仅供参考。

---

# GinyScreen — 网络连接实现说明

> 一句话：**信令面走 Socket.IO（WebSocket），媒体面走 WebRTC P2P（DTLS-SRTP 加密），
> 语音与屏幕画面不经过服务器，服务器只做"房间/频道/信令"的转发。**

```
┌─────────────┐  ① Socket.IO 信令(WebSocket)  ┌──────────────┐  ① Socket.IO 信令  ┌─────────────┐
│  浏览器 A    │ ─────────────────────────────▶│  Node 服务器  │◀───────────────────────────── │  浏览器 B   │
│ (玩家A)     │                               │  (信令/房间)  │                               │ (玩家B)     │
└──────┬──────┘                               └──────────────┘                               └──────┬──────┘
       │                                                                                            │
       └──────────────── ② WebRTC P2P：Opus 语音 + 屏幕视频 (STUN/TURN 打洞后直连) ─────────────────┘
```

---

## 一、信令面（Signaling Plane）

### 1.1 连接建立
- 客户端用 Socket.IO 客户端 `io()` 连接服务器，首选 **WebSocket**，失败自动降级 HTTP 长轮询（`transports: ['websocket', 'polling']`）。
- 每次页面打开只有 **一条** 信令连接，房间内所有频道操作复用这条连接。

### 1.2 事件流（以两个玩家进同一频道为例）

| 步骤 | 方向 | 事件 | 内容 |
|------|------|------|------|
| 1 | A→S | `room:create` | 昵称 → 加入本服务器唯一默认房间并返回 `roomState`（v1.3.0 起无房间号） |
| 2 | B→S | `room:join` | 昵称 → 加入同一个默认房间并广播 `room:state` |
| 3 | A→S | `channel:join` | 频道 id → 服务器返回 `{channelId, peers}`（同频道已有成员） |
| 4 | S→A | `channel:join` ack | `peers = [B]`，A 据此为 B 创建 PeerConnection |
| 5 | S→B | `user:joined` | 通知 B："A 也进了频道"，B 同样创建 PC |
| 6 | A↔B↔S | `signal` | 双向转发 **SDP offer/answer + ICE candidate** |
| 7 | 媒体面 | — | DTLS 握手完成，Opus 语音直连 |

其它信令事件：
- `media:update {mic, deaf, screen}` — 麦克风/闭麦/共享状态变更，广播 `room:state` 给全房间（供 UI 渲染成员图标）。
- `chat:send` / `chat:message` — 房间文字聊天，经服务器广播。
- `channel:leave` / `room:leave` / `disconnect` — 离开频道/房间/掉线，服务器更新状态并广播 `room:state`，空房间自动销毁。

### 1.3 为什么需要服务器
WebRTC 建立连接前必须先交换 SDP/ICE 信息（信令），但 WebRTC 本身不规定信令方式，所以用 Socket.IO 自己实现。服务器**不转发任何语音/视频数据包**。

---

## 二、媒体面（Media Plane）

### 2.1 拓扑：P2P mesh
- 同频道内 **每两个人之间建一条 RTCPeerConnection**（n 人 = n(n-1)/2 条连接，这里是全互联 mesh）。
- 优点：服务器零媒体带宽、部署成本极低、语音不经过服务器（隐私好）。
- 代价：上行带宽随人数增长（见 §4），适合 2~8 人开黑；更大规模走 SFU 升级路径。

### 2.2 音频链路（发送端）
```
麦克风
  └─ getUserMedia({ echoCancellation, noiseSuppression, autoGainControl, channelCount:1 })
       └─ MediaStreamSource
            ├─▶ GainNode ◀─ 静音/VAD/PTT 在此控制（0 或 1，20ms 淡入淡出）
            │     └─▶ AnalyserNode ─▶ 本地 VAD(RMS+迟滞) + 音量表
            └─▶ MediaStreamDestination ──▶ addTrack() 到每条 PeerConnection
```
关键点：
- **麦克风 → 增益 → 分析 → 发送** 全部在浏览器本地 Web Audio 图里完成；
  静音/VAD/PTT 只改 GainNode 的值，**不重新协商 SDP**。
- 发送流（`MediaStreamDestination`）生命周期固定：切换输入设备、改降噪设置时只换麦克风源，
  已建立的连接无需重协商（这就是 `AudioEngine.outStream` 保持不变的原因）。
- 编码由 WebRTC 自动协商为 **Opus**（语音场景首选：低延迟、窄带到全带宽自适应、内置丢包补偿）。

### 2.3 音频链路（接收端）
```
对端音轨(ontrack)
  └─ <audio autoplay> 播放
       └─ 独立 AnalyserNode ─▶ RMS ─▶ 远端音量表 + “正在说话”指示灯(阈值 0.07)
```

### 2.4 屏幕共享
- `getDisplayMedia({ video: { frameRate: 30 } })` 采集屏幕/窗口/标签页。
- 对每个对端：
  - **首次共享**：`pc.addTrack(视频轨)` → 新增 transceiver → 自动触发 `onnegotiationneeded` → 重协商（offer/answer），对端 `ontrack` 渲染视频瓦片。
  - **再次共享（换窗口）**：`sender.replaceTrack(新轨)` — 同类型替换，**无需重协商**。
  - **停止**：`sender.replaceTrack(null)` + 本地停轨；对端通过 `track.onended` 移除瓦片。
- 多人可同时共享（每人一条视频 transceiver）。

### 2.5 NAT 穿透（STUN / ICE / TURN）
- 建立连接时双方各自收集 **ICE candidate**：本地地址(host)、经 STUN 反射的公网地址(srflx)、TURN 中继地址(relay)。
- 默认配置 `stun:stun.l.google.com:19302`（仅用于发现公网映射，不传媒体）。
- 严格 NAT/对称 NAT 下 P2P 打洞失败时，需要 **TURN 中继兜底**（媒体会经过 TURN，但内容仍是 DTLS-SRTP 加密的）：
  ```
  TURN_URL=turn:域名:3478 TURN_USER=xxx TURN_PASS=yyy npm start
  ```
- ICE candidate 同样经 `signal` 事件转发。

### 2.6 协商冲突处理（Perfect Negotiation）
- 双方都可能同时发起 offer（如同时进频道），按 socket id 字典序区分 **polite/impolite**：
  - 冲突时 polite 方回滚自己的 offer 接受对方；impolite 方忽略对方的 offer。
- 这是 W3C 推荐的完美协商模式，避免 glare（信令冲突）。

### 2.7 安全
- WebRTC 强制 **DTLS 握手 + SRTP 加密**：mesh 模式下语音/屏幕内容端到端加密，
  服务器（即使想）也看不到明文媒体。

---

## 三、三种场景下的路径

| 场景 | 信令 | 媒体 |
|------|------|------|
| 本机双开 | localhost WebSocket | 回环直连（host candidate） |
| 家庭局域网 | 局域网 WebSocket | 局域网 IP 直连，无跨网 |
| 公网开黑 | 服务器 WebSocket | STUN 打洞直连；打洞失败走 TURN 中继 |

---

## 四、带宽与延迟

- 单人说话 Opus 通常 **40~80 kbps**（视网络协商的码率档位）。
- mesh 下每人上行 = `(频道人数 - 1) × 单路码率`：8 人时约 300~560 kbps 上行，家用宽带上行足够。
- 延迟：局域网 <10ms；公网取决于 RTT（打洞成功后通常与双方物理距离相关）。

## 五、与“服务器转发”方案（SFU）的对比

| | mesh（当前实现） | SFU（如 mediasoup/LiveKit） |
|---|---|---|
| 服务器媒体带宽 | 0（最省） | 每人 1 路上行 + 转发 |
| 人数上限 | ~8 人（上行瓶颈） | 几十~上百人 |
| 部署复杂度 | 极低（一个 Node 进程） | 需要 media worker、转发节点 |
| 隐私 | 语音完全不经服务器 | 服务器可见（虽加密可解） |
| 升级路径 | — | 信令层已隔离，可平滑替换 |

> 结论：v0.1 用 mesh 是"小圈子自托管"的最优解；等需要支持大频道时，把 `webrtc.js` 的
> "每对端一条 PC"替换为"每人一条到 SFU 的上行 + 下行订阅"即可，房间/频道/状态模型不变。
