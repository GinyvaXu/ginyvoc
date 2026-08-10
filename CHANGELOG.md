# CHANGELOG

本项目遵循语义化版本（Semantic Versioning），版本号以根目录 `VERSION` 文件为唯一来源。
版本发布流程见 `VERSIONING.md`。

## [v0.5.0] - 2026-08-10

### 新增
- 修复顶部菜单“点了没反应”：根因是菜单栏 `overflow-x:auto` 会把绝对定位的下拉面板裁剪掉（Playwright `isVisible` 检测不出），改为 `overflow:visible`，语音/屏幕/房间/设置/帮助五个菜单全部真实可用
- 音频输入入口显性化：语音菜单新增「音频设置（输入/输出设备）」，一键直达完整设置弹窗
- 输出设备切换：设置下拉与完整设置弹窗均可选择扬声器（`setSinkId` 即时生效），支持记忆
- 屏幕共享支持 **OBS 虚拟摄像头**来源：屏幕菜单切换「屏幕/窗口/标签页」或「OBS 虚拟摄像头」，共享 OBS 合成画面（游戏+摄像头画中画+弹幕）
- 共享系统声音：勾选后把系统声音随画面一起传给队友，适合开黑一起看视频/电影
- 设置持久化：输入/输出设备、VAD、降噪、PTT 按键、共享来源与系统声音均记忆到 localStorage
- 输入设备下拉补充「默认（系统默认麦克风）」选项，修复默认设备被误存为空串的问题

### 修复
- WebRTC 远端音频分流：原实现按“远端流对象是否等于本地音频流”判定麦克风/共享声音，该比较恒不成立（远端流是独立对象），改为按屏幕流 id + 流内视频轨判定；双端实测确认麦克风与共享声音各归其位、闭麦全部静音

## [v0.4.0] - 2026-08-10

### 新增
- 项目正式更名 **GinyVoC**，全链路清理旧名称残留（含需求文档、函数名、产物命名）
- Debug 版 exe 构建流程（`npm run dist:debug`）：控制台 + 实时日志 + DevTools，每次迭代必出
- 自动更新：桌面安装版支持 帮助→检查更新 / 启动后台检查；多源清单（raw GitHub / 国内代理 / jsDelivr / Releases API）+ NSIS 静默升级 + 自动重启（参考诺丁汉桌游项目）
- `update.json` 自动更新清单（随 git 推送）；`desktop/updater.js` + `desktop/preload.cjs`
- 崩溃报告：主进程/渲染进程未捕获异常写 `crash_时间戳_类型.txt`
- 新增 docs/gap-analysis.md（功能差距分析）与 docs/tech-alternatives.md（技术路线替代方案对比）

### 修复
- 房间号显示被 renderRoom 覆盖（丢失“房间号”前缀样式）
- 帮助菜单“检查更新”入口与更新弹窗；favicon 缺失导致 404

### 规范
- 构建产物与目录全部英文命名（GinyVoC-Debug/Portable/Setup-vX.Y.Z.exe）；历史中文产物已重命名
- 版本号单一来源维持 VERSION；发布流程补充 debug 版前置步骤

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
