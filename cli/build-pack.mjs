/**
 * build-pack.mjs — npm 发布组装(prepack)/清理(postpack)
 *
 * 源仓布局:templates/ 在仓库根,cli/ 只是 workspace 之一;
 * npm 包布局:templates/ 必须在包内(cli/templates)。
 * prepack 把 ../templates + ../docs 拷进 cli/,postpack 清掉,工作区保持干净。
 */
import { cpSync, rmSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoTemplates = join(here, '..', 'templates');
const pkgTemplates = join(here, 'templates');

if (process.argv.includes('--clean')) {
  rmSync(pkgTemplates, { recursive: true, force: true });
  process.exit(0);
}

// 组装:repo templates → cli/templates
rmSync(pkgTemplates, { recursive: true, force: true });
mkdirSync(pkgTemplates, { recursive: true });
for (const part of ['root', 'web', 'backend']) {
  cpSync(join(repoTemplates, part), join(pkgTemplates, part), { recursive: true });
}
// docs 随包分发为 templates/docs(CLI copyDocs 双路径查找)
cpSync(join(here, '..', 'docs'), join(pkgTemplates, 'docs'), { recursive: true });

// npm pack 永不发布名为 .gitignore/.npmrc 的文件(npm 特殊名单)。
// 组装时重命名为 _gitignore/_npmrc,CLI 读取时还原(见 index.js RENAME_MAP)。
const RENAME = { '.gitignore': '_gitignore', '.npmrc': '_npmrc' };
for (const part of ['root', 'web', 'backend']) {
  for (const [from, to] of Object.entries(RENAME)) {
    const src = join(pkgTemplates, part, from);
    if (existsSync(src)) renameSync(src, join(pkgTemplates, part, to));
  }
}
console.log('✓ templates 已组装到 cli/templates(root/web/backend/docs,含 dotfile 重命名)');
