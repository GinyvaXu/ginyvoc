// export-electron.mjs — 把 build\ 里构建好的 exe 复制到 installer\（交付目录）
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const buildDir = join(root, 'build');
const installerDir = join(root, 'installer');
mkdirSync(installerDir, { recursive: true });

let picked = [];
try {
  picked = readdirSync(buildDir).filter((f) => /\.exe$/.test(f));
} catch { /* build 目录不存在 */ }
// 同时收集 build\debug\ 下的 Debug 版 exe
try {
  picked = picked.concat(readdirSync(join(buildDir, 'debug')).filter((f) => /\.exe$/.test(f)));
} catch { /* 无 Debug 构建 */ }

if (!picked.length) {
  console.error('build\\ 下没有找到 exe，请先运行: npm run dist:portable 或 npm run dist:installer');
  process.exit(1);
}

for (const f of picked) {
  copyFileSync(join(buildDir, f), join(installerDir, f));
}

console.log(`[${pkg.version}] 已复制 ${picked.length} 个 exe 到 installer\\:`);
for (const f of picked) console.log('  ' + f);
