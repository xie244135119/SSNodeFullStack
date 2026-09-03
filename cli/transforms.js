/**
 * transforms.js — 确定性文本替换表(纯数据,无副作用)
 *
 * 输入:项目身份变量(name、displayName、dbPrefix、containerName 等)
 * 输出:按文件路径分组的替换规则数组,由 CLI 对生成物逐文件应用。
 *
 * 原则:
 *   1. 每条规则来自对模板仓库的实测 grep(见各条注释的出处),
 *      不允许「应该有」的猜测项 —— 新增模板引用时同步补表。
 *   2. 替换目标是「模板身份串」,不碰业务代码语义。
 *   3. JSON 文件走 parse/改字段/stringify(见 index.js 的 applyTransforms),
 *      本表只负责文本类文件。
 */

/**
 * @param {object} id 项目身份
 * @param {string} id.name            项目名(npm 合法,如 my-app)
 * @param {string} id.displayName     展示名(中文标题,如 我的项目)
 * @param {string} id.dbPrefix        SQLite 文件名前缀(默认 = name)
 * @param {string} id.containerName   部署容器/服务名(默认 = `${name}-backend`)
 * @param {string} id.appRoot         服务器部署根目录(默认 = `/data/server/${name}`)
 */
export function buildTransforms(id) {
  const name = id.name;
  const displayName = id.displayName || name;
  const dbPrefix = id.dbPrefix || name;
  const containerName = id.containerName || `${name}-backend`;
  const appRoot = id.appRoot || `/data/server/${name}`;

  // ── 通用规则(所有文本文件全局应用,顺序敏感:长串先替换) ──
  const globalRules = [
    // DB 文件名:template.<env>.sqlite → <dbPrefix>.<env>.sqlite
    // 出处:sqlite.config.ts:59 / configuration.ts:74-75 / data-source.ts:33 /
    //      ops/sqlite/config.sh:39-40 / config.{develop,prod}.yaml:10 / docker-compose.yml:28
    { find: 'template.prod.sqlite', replace: `${dbPrefix}.prod.sqlite` },
    { find: 'template.dev.sqlite', replace: `${dbPrefix}.dev.sqlite` },
    // 模板字符串形态:ops 探针(sqlite-backup*.probe.ts)用 `template.${env}.` 前缀匹配
    { find: 'template.${env}.', replace: `${dbPrefix}.\${env}.` },
    { find: 'template.<env>.sqlite', replace: `${dbPrefix}.<env>.sqlite` },
    // 不带扩展名的 TAG/注释/示例形态:
    //  - sqlite/config.sh:43 TAG 示例 template.prod;sqlite/README.md:25 同
    //  - sqlite-backup-list.probe.ts:59 'template.prod'/'template.develop' 字面量
    //  - sqlite-backup.probe.ts:139 dirName 示例 template.prod.<ts>
    { find: 'template.develop', replace: `${dbPrefix}.develop` },
    { find: 'template.prod', replace: `${dbPrefix}.prod` },
    { find: 'template.dev', replace: `${dbPrefix}.dev` },
    // 部署身份:容器名 / 服务名 / 镜像名 / APP_ROOT
    // 出处:docker-compose.yml:13,17 / install.sh:392 / docker/config.sh:17,19 /
    //      systemd/config.sh:7 / pm2/config.sh:7 / restore.sh:103-105 / .env.example:6,7,11
    { find: 'fullstack-template-backend', replace: containerName },
    // 服务器部署根目录
    // 出处:server.config.example.cjs:28 / ops/sqlite/config.sh:16 / sqlite/README.md:34,37,40,53
    { find: '/data/server/fullstack-template', replace: appRoot },
    // 模板身份字面量(兜底,放最后;上面的长串已先被替换,不会误伤)
    { find: 'fullstack-template', replace: name },
    // 编排脚本与文档里的 --filter 子包名(包名已派生为 <name>-web / <name>-backend,见 index.js ⑤b)
    // 出处:templates/root/scripts/{publish,rollback}.cjs、AGENTS.md/README.md/CLAUDE.md 示例命令
    { find: '--filter web', replace: `--filter ${name}-web` },
    { find: '--filter backend', replace: `--filter ${name}-backend` },
  ];

  // ── 按文件的定点规则(精确锚点,避免全局误伤) ──
  const fileRules = [
    {
      // 后台顶栏 + 登录页品牌
      // 出处:web/config/project.config.ts:3 title: '<模板项目>'
      file: 'web/config/project.config.ts',
      rules: [{ find: "title: '<模板项目>'", replace: `title: '${displayName}'` }],
    },
    {
      // Swagger 标题(main.ts:60 setTitle)
      file: 'backend/src/main.ts',
      rules: [{ find: 'fullstack-template 后台服务', replace: `${displayName} 后台服务` }],
    },
    {
      // 根 README 标题与必改清单状态(templates/root/README.md)
      file: 'README.md',
      rules: [
        { find: '# __PKG_NAME__', replace: `# ${name}` },
        { find: '# fullstack-template', replace: `# ${name}` },
      ],
    },
  ];

  return { globalRules, fileRules };
}

/**
 * 允许文本替换的文件后缀(其余跳过,防止误改二进制)
 */
export const TEXT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.json', '.yaml', '.yml',
  '.md', '.sh', '.html', '.css', '.less', '.scss', '.env', '.example',
  '.gitignore', '.npmrc', '.prettierignore', '.dockerignore', '',
]);

/**
 * 对单个文件内容应用规则;返回替换后的内容与命中计数。
 * 供 CLI 逐文件调用;纯函数,不落盘。
 */
export function applyRules(content, rules) {
  let hits = 0;
  let out = content;
  for (const r of rules) {
    if (!out.includes(r.find)) continue;
    out = out.split(r.find).join(r.replace);
    hits += 1;
  }
  return { content: out, hits };
}
