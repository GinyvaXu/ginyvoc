// archive-release.mjs — 发布归档：读取 VERSION，构建产物复制到 versions/vX.Y.Z/{dist,installer}，源码快照到 versions/vX.Y.Z/src
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const version = readFileSync(join(root, 'VERSION'), 'utf8').trim();
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('VERSION 格式非法:', version);
  process.exit(1);
}
const verDir = join(root, 'versions', `v${version}`);
const srcDir = join(verDir, 'src');
const distDir = join(verDir, 'dist');
const instDir = join(verDir, 'installer');
mkdirSync(srcDir, { recursive: true });
mkdirSync(distDir, { recursive: true });
mkdirSync(instDir, { recursive: true });

// 1) 构建产物：build\ 下的 exe → installer\；便携版另复制到 dist\
const buildDir = join(root, 'build');
if (existsSync(buildDir)) {
  for (const f of readdirSync(buildDir)) {
    if (!/\.exe$/.test(f)) continue;
    const src = join(buildDir, f);
    cpSync(src, join(instDir, f));
    if (/便携版/.test(f)) cpSync(src, join(distDir, f));
  }
}

// 2) 源码快照：排除构建产物、依赖、归档目录
const EXCLUDE = new Set(['.git', 'node_modules', 'build', 'dist', 'installer', 'logs', 'versions', '成品', '中间产物']);
function copyFilter(s) {
  const rel = s.slice(root.length + 1);
  return !EXCLUDE.has(rel.split(/[\\/]/)[0]);
}
for (const name of readdirSync(root)) {
  if (EXCLUDE.has(name)) continue;
  if (name.startsWith('_')) continue; // 构建临时文件（_dev_server.pid 等）不入快照
  cpSync(join(root, name), join(srcDir, name), { recursive: true, filter: copyFilter });
}

console.log(`已归档 v${version} -> versions/v${version}/ (src 源码快照 + dist 便携版 + installer 安装版)`);
