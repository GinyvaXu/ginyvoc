# AGENTS.md — GinyScreen（GinyScreen）项目规则与状态

## 项目简介
自托管的**屏幕共享**联机工具：房间 + 多人轮流共享 + 系统声音，一起看视频/电影/游戏画面。
- 浏览器版：Node.js + Express + Socket.IO 信令服务器，WebRTC P2P mesh 媒体（不含语音通话/文字聊天）
- 桌面版：Electron 壳（`desktop/main.js`）内嵌信令服务器，Windows 便携版/安装版 exe

## 目录结构
```
server/    信令服务器（index.js CLI 入口 / app.js 可嵌入启动函数 / rooms.js / signaling.js / logger.js）
client/    Web 客户端（原生 ES Modules，无构建步骤；index.html + css/style.css + js/main|signaling|screenshare|webrtc|ui.js）
desktop/   Electron 桌面壳（主进程 main.js + 自动更新 updater.js + preload.cjs）
assets/    应用图标（icon.png / icon.ico / tray.png，由 scripts/gen-icon.mjs 生成）
scripts/   构建/测试/导出/归档脚本（build-debug.mjs 构建 Debug 版 exe）
docs/      调研报告 / 网络架构 / 联机方案(fri-network.md) / 功能差距
source/    需求文档
build/     构建temp（electron-builder 输出，不入库）
installer/ 交付 exe（不入库，走 GitHub Releases）
logs/      运行日志（不入库）
versions/  版本归档：vX.Y.Z/src 源码快照入库；dist/installer 二进制不入库
release/   浏览器版 Debug 自包含导出包（不入库）
temp/      证书等中间文件（不入库）
update.json   自动更新清单（版本/下载地址/更新说明，随 git 推送）
```

## 常用命令
```bash
npm start               # 浏览器版：启动信令服务器（http://localhost:3000）
npm run electron        # 桌面版开发运行
npm test                # 信令冒烟测试（11 项断言，需先 npm start）
npm run icon            # 重新生成图标
npm run dist:debug      # 构建 Debug 版 exe（控制台+日志+DevTools，每次迭代必出）
npm run dist:portable   # 构建便携版 exe（构建前自动从 VERSION 同步版本号）
npm run dist:installer  # 构建安装版 exe
npm run finalize        # 复制 build\ 下的 exe 到 installer\
npm run archive         # 发布归档：产物/源码快照到 versions/vX.Y.Z/
```

## 版本与发布（遵循 project-git-mgmt）
- 分支模型：`main` 只接受来自 `develop` 的合并（--no-ff）；日常开发在 `develop`，不额外建 feature 分支
- 版本号单一来源：只改 `VERSION` 文件；构建脚本（sync-version.mjs）自动同步到 package.json，禁止手写
- 提交规范：`feat:` / `fix:` / `release:` / `build:` / `chore:` / `refactor:` / `docs:` / `test:`，一个 commit 只做一件事；源码与产物分开提交
- 发布流程：改 VERSION → 每次迭代先构建 Debug 版（`npm run dist:debug`）供试用；功能验证通过后再构建便携版/安装版（dist:portable / dist:installer）→ `npm run archive` 归档到 versions/vX.Y.Z → `release:` 提交源码、`build:` 提交归档 → 合并 main → 打 tag + 上传 installer 到 GitHub Releases → 更新 update.json 清单 → 清理本地旧二进制（保留最近 1~2 版）
- 变更记录写 CHANGELOG.md；版本管理规范见 VERSIONING.md

## 注意事项
- 项目路径含 `&`（ClaudeCode & AI）：npm scripts 一律用 `node node_modules/electron-builder/cli.js` 直调 CLI，不要用 `.bin` 的 .cmd 垫片（cmd 会把路径按 `&` 截断）
- Electron 主进程：`session.defaultSession` 必须在 `app.whenReady()` 之后使用，否则启动会静默失败
- 日志：Debug 版双写 work-日期.log / error-日期.log，目录由 LOG_DIR 控制；桌面版写在 exe 旁 logs\
- **无语音/无聊天**：客户端 media 面只有屏幕画面 + 可选系统声音；不要加回麦克风/文字聊天（用户明确要求专注共享）
- **mesh 连接模型**：每个对端最多两条单向连接（inPcs 观看 / outPcs 共享），避免 SDP 协商冲突；详见 client/js/webrtc.js
- **共享停止**：以服务器 `share:update` 为准清理画面（不要依赖 track mute，窗口最小化也会触发）
- WebRTC mesh 适合 2~4 人共享/观看；更大规模需 SFU（mediasoup/LiveKit，见 docs/tech-alternatives.md）
- 局域网/公网需 HTTPS 与 TURN，见 README「局域网使用」「公网使用」

## 当前状态
- 版本：v1.3.2（取消房间号：单服务器单房间；首页直接填 IP:端口 加入，主机自选端口默认 3000；保存配置后自动重启进入；v1.3.2 远程连接失败自动恢复——501 拦截页/证书错误自动跳回本地设置页，托盘与首页新增「服务器设置」逃生入口）
- 分支：main（稳定）/ develop（日常开发）
- 远程：https://github.com/GinyvaXu/GinyScreen（公开，自动更新依赖公开访问 update.json 与 Releases 资产）
- 自动更新：桌面安装版内置 updater.js（多源清单 + NSIS 静默升级），清单为根目录 update.json
- 构建产物一律英文命名（GinyScreen-Debug/Portable/Setup-vX.Y.Z.exe）；目录不含中文
- 待办与路线图见 source/requirements.md 与 docs/gap-analysis.md

- 组网方案：用户选定 **ZeroTier** 为主（免费 1 网络 / 25 设备，UDP 9993 P2P，完整教程见 docs/fri-network.md 1.3）；蒲公英/米西为备选；SakuraFrp 隧道必须开启「自动 HTTPS」
