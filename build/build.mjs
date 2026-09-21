#!/usr/bin/env node
/**
 * zjumihomo 打包器 —— 把 src/ 下的多文件 ESM 源码编译成单个 Cloudflare Worker。
 *
 * 手写实现，不依赖任何打包工具。做的事：
 *   1. 从 src/index.js 出发递归解析 import，建立模块依赖图
 *   2. 拓扑排序，保证 const/let 在依赖它的模块之前求值
 *   3. 把 js-yaml 之类的裸模块说明符解析到 node_modules 并内联进来
 *   4. 去掉 import 语句、剥掉 export 关键字，拼成单文件
 *   5. 检查跨模块的顶层重名——拼接成同一作用域后重名会静默改变语义，必须报错
 *
 * 产物 dist/_worker.js 完全自包含：没有 import，没有外部依赖，可以直接粘进
 * Cloudflare 控制台编辑器。
 *
 * 用法：npm run build
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// 打包器自己也要解析 YAML（数据文件导入），直接复用项目依赖
const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'src/index.js');
const OUT = path.join(ROOT, 'dist/_worker.js');

/* ──────────────────────────── 词法扫描 ────────────────────────────
 * 只需要识别出「顶层的 import / export 语句」和「顶层的声明名」，
 * 所以写一个够用的扫描器：正确跳过字符串、模板串（含 ${} 嵌套）、
 * 注释、正则字面量，并跟踪括号深度。深度为 0 的 import/export 关键字
 * 必然是语句（ESM 里这两个是保留字，唯一的例外是动态 import(...)）。
 */

// 判断某个 '/' 是正则字面量的开始，还是除号。
// 依据是前一个有效字符：出现在这些符号之后的一定是正则。
const REGEX_PRECEDERS = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>',
]);

function prevSignificant(code, i) {
  for (let j = i - 1; j >= 0; j--) {
    const c = code[j];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
    return c;
  }
  return '';
}

function skipString(code, i) {
  const q = code[i];
  if (q === '`') return skipTemplate(code, i);
  i++;
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) return i + 1;
    if (c === '\n') return i;          // 未闭合的普通字符串
    i++;
  }
  return i;
}

function skipTemplate(code, i) {
  i++;                                  // 跳过开头的反引号
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') return i + 1;
    if (c === '$' && code[i + 1] === '{') {
      let depth = 1;
      i += 2;
      while (i < code.length && depth > 0) {
        const ch = code[i];
        if (ch === '\\') { i += 2; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { i = skipString(code, i); continue; }
        if (ch === '{') { depth++; i++; continue; }
        if (ch === '}') { depth--; i++; continue; }
        i++;
      }
      continue;
    }
    i++;
  }
  return i;
}

function skipRegex(code, i) {
  i++;                                  // 跳过开头的斜杠
  let inClass = false;
  while (i < code.length) {
    const c = code[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '\n') return i;           // 未闭合
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
    i++;
  }
  return i;
}

/** 推进 i，跳过注释；返回新的 i，未命中注释时返回 -1 */
function skipComment(code, i) {
  if (code[i] !== '/') return -1;
  if (code[i + 1] === '/') {
    const e = code.indexOf('\n', i);
    return e < 0 ? code.length : e + 1;
  }
  if (code[i + 1] === '*') {
    const e = code.indexOf('*/', i + 2);
    return e < 0 ? code.length : e + 2;
  }
  return -1;
}

/** 从语句起始位置往后找到该语句的结束位置（含分号） */
function findStatementEnd(code, start) {
  let i = start;
  let depth = 0;
  const isFnOrClass = /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\b/.test(code.slice(start, start + 64));

  while (i < code.length) {
    const c = code[i];

    const afterComment = skipComment(code, i);
    if (afterComment >= 0) { i = afterComment; continue; }

    if (c === '"' || c === "'" || c === '`') { i = skipString(code, i); continue; }

    if (c === '/' && REGEX_PRECEDERS.has(prevSignificant(code, i))) { i = skipRegex(code, i); continue; }

    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }

    if (c === '}' || c === ')' || c === ']') {
      depth--;
      i++;
      if (depth === 0 && isFnOrClass) return i;      // export function f() { ... }
      continue;
    }

    if (depth === 0 && c === ';') return i + 1;

    i++;
  }
  return code.length;
}

/** 扫描出所有顶层 import / export 语句的位置区间 */
function scanStatements(code) {
  const out = [];
  let i = 0;
  let depth = 0;

  while (i < code.length) {
    const c = code[i];

    const afterComment = skipComment(code, i);
    if (afterComment >= 0) { i = afterComment; continue; }

    if (c === '"' || c === "'" || c === '`') { i = skipString(code, i); continue; }

    if (c === '/' && REGEX_PRECEDERS.has(prevSignificant(code, i))) { i = skipRegex(code, i); continue; }

    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; continue; }

    if (depth === 0 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < code.length && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);

      // import(...) 是动态导入，属于表达式，不是语句
      const isDynamicImport = word === 'import' && code[j] === '(';
      if ((word === 'import' || word === 'export') && !isDynamicImport) {
        const end = findStatementEnd(code, i);
        out.push({ kind: word, start: i, end, text: code.slice(i, end) });
        i = end;
        continue;
      }
      i = j;
      continue;
    }

    i++;
  }

  return out;
}

/** 收集顶层声明的变量名，用于跨模块重名检查 */
function collectTopLevelNames(code, stmts) {
  const names = new Set();
  // 把 import/export 语句挖掉再扫，避免把 import 的名字当成声明
  let masked = '';
  let cursor = 0;
  for (const st of stmts) {
    masked += code.slice(cursor, st.start);
    masked += ' '.repeat(st.end - st.start);   // 用空格占位，保持偏移不变
    cursor = st.end;
  }
  masked += code.slice(cursor);

  let i = 0;
  let depth = 0;
  while (i < masked.length) {
    const c = masked[i];

    const afterComment = skipComment(masked, i);
    if (afterComment >= 0) { i = afterComment; continue; }
    if (c === '"' || c === "'" || c === '`') { i = skipString(masked, i); continue; }
    if (c === '/' && REGEX_PRECEDERS.has(prevSignificant(masked, i))) { i = skipRegex(masked, i); continue; }

    if (c === '{' || c === '(' || c === '[') { depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; continue; }

    if (depth === 0 && /[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < masked.length && /[A-Za-z0-9_$]/.test(masked[j])) j++;
      const word = masked.slice(i, j);

      if (word === 'const' || word === 'let' || word === 'var') {
        let k = j;
        while (k < masked.length && /\s/.test(masked[k])) k++;
        if (masked[k] === '{' || masked[k] === '[') {
          // 解构声明：收集花括号/方括号里的标识符
          const open = masked[k];
          const close = open === '{' ? '}' : ']';
          let d = 0;
          let m = k;
          while (m < masked.length) {
            const ch = masked[m];
            if (ch === open) d++;
            else if (ch === close) { d--; if (d === 0) break; }
            else if (/[A-Za-z_$]/.test(ch)) {
              let e = m;
              while (e < masked.length && /[A-Za-z0-9_$]/.test(masked[e])) e++;
              const id = masked.slice(m, e);
              // 跳过属性名位置（形如 a: b 里的 a）和对象简写的值
              const before = masked.slice(Math.max(0, m - 1), m);
              if (before !== '.') names.add(id);
              m = e;
              continue;
            }
            m++;
          }
          i = m;
          continue;
        }
        // 普通声明：const a = 1, b = 2;
        if (/[A-Za-z_$]/.test(masked[k] || '')) {
          let e = k;
          while (e < masked.length && /[A-Za-z0-9_$]/.test(masked[e])) e++;
          names.add(masked.slice(k, e));
          // 处理逗号分隔的多个声明
          let p = e;
          while (p < masked.length) {
            if (masked[p] === ';' || masked[p] === '\n') break;
            if (masked[p] === '=') {         // 跳过初始化表达式
              let d = 0;
              while (p < masked.length) {
                const ch = masked[p];
                if (ch === '(' || ch === '[' || ch === '{') d++;
                else if (ch === ')' || ch === ']' || ch === '}') { if (d === 0) break; d--; }
                else if (ch === ';' && d === 0) break;
                p++;
              }
              continue;
            }
            if (masked[p] === ',') {
              let q = p + 1;
              while (q < masked.length && /\s/.test(masked[q])) q++;
              if (/[A-Za-z_$]/.test(masked[q] || '')) {
                let r = q;
                while (r < masked.length && /[A-Za-z0-9_$]/.test(masked[r])) r++;
                names.add(masked.slice(q, r));
                p = r;
                continue;
              }
            }
            p++;
          }
        }
        i = j;
        continue;
      }

      if (word === 'function' || word === 'class') {
        let k = j;
        while (k < masked.length && /\s/.test(masked[k])) k++;
        // function* generator 和 async 已在上面按标识符跳过
        if (masked[k] === '*') {
          k++;
          while (k < masked.length && /\s/.test(masked[k])) k++;
        }
        if (/[A-Za-z_$]/.test(masked[k] || '')) {
          let e = k;
          while (e < masked.length && /[A-Za-z0-9_$]/.test(masked[e])) e++;
          names.add(masked.slice(k, e));
        }
      }

      i = j;
      continue;
    }

    i++;
  }

  return names;
}

/* ──────────────────────────── 模块解析 ──────────────────────────── */

/** 把裸模块名解析到 node_modules 里的实际文件 */
function resolveBare(spec, fromDir) {
  let dir = fromDir;
  for (;;) {
    const pkgDir = path.join(dir, 'node_modules', spec);
    const pkgJson = path.join(pkgDir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
      const entry =
        (pkg.exports && pkg.exports['.'] && (pkg.exports['.'].import || pkg.exports['.'].default)) ||
        pkg.module || pkg.main || 'index.js';
      const resolved = path.join(pkgDir, entry);
      if (!fs.existsSync(resolved)) throw new Error(`找不到 ${spec} 的入口: ${resolved}`);
      return resolved;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`无法解析模块 "${spec}"（从 ${fromDir} 出发）`);
}

function resolveSpecifier(spec, fromFile) {
  if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/')) {
    const p = spec.startsWith('/') ? spec : path.resolve(path.dirname(fromFile), spec);
    if (!fs.existsSync(p)) throw new Error(`找不到文件: ${p}（被 ${fromFile} 引用）`);
    return fs.realpathSync(p);
  }
  return fs.realpathSync(resolveBare(spec, path.dirname(fromFile)));
}

/** 解析单条 import 语句 */
function parseImport(text, file) {
  const m = text.match(/^import\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2\s*;?$/);
  if (!m) {
    if (/^import\s+['"]/.test(text)) throw new Error(`${file}: 不支持副作用导入: ${text.trim()}`);
    throw new Error(`${file}: 无法解析 import 语句: ${text.trim()}`);
  }
  const clause = m[1];
  const source = m[3];
  const specifiers = [];

  if (clause.startsWith('*')) throw new Error(`${file}: 不支持命名空间导入: ${text.trim()}`);

  const braceStart = clause.indexOf('{');
  if (braceStart >= 0) {
    const defaultPart = clause.slice(0, braceStart).replace(/,\s*$/, '').trim();
    if (defaultPart) specifiers.push({ imported: 'default', local: defaultPart });
    const inner = clause.slice(braceStart + 1, clause.lastIndexOf('}'));
    for (const piece of inner.split(',')) {
      const t = piece.trim();
      if (!t) continue;
      const asMatch = t.match(/^(\S+)\s+as\s+(\S+)$/);
      if (asMatch) specifiers.push({ imported: asMatch[1], local: asMatch[2] });
      else specifiers.push({ imported: t, local: t });
    }
  } else {
    const defaultName = clause.trim();
    if (!defaultName) throw new Error(`${file}: import 子句为空: ${text.trim()}`);
    specifiers.push({ imported: 'default', local: defaultName });
  }

  return { source, specifiers };
}

/** 解析单条 export 语句，返回 { named: Map<导出名, 本地名>, isDefault: bool, keep: string } */
function parseExport(text, file, isEntry) {
  const named = new Map();

  // export { a, b as c };
  if (/^export\s*\{/.test(text)) {
    const inner = text.slice(text.indexOf('{') + 1, text.lastIndexOf('}'));
    if (/^\s*$/.test(inner)) return { named, isDefault: false, keep: '' };
    for (const piece of inner.split(',')) {
      const t = piece.trim();
      if (!t) continue;
      const asMatch = t.match(/^(\S+)\s+as\s+(\S+)$/);
      if (asMatch) named.set(asMatch[2], asMatch[1]);
      else named.set(t, t);
    }
    return { named, isDefault: false, keep: '' };
  }

  // export default ...
  if (/^export\s+default\b/.test(text)) {
    if (!isEntry) {
      throw new Error(`${file}: 非入口模块不支持 export default，请改用具名导出`);
    }
    return { named, isDefault: true, keep: text };
  }

  // export const/let/var/function/class/async function ...
  const declMatch = text.match(/^export\s+(?:async\s+)?(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/);
  if (!declMatch) {
    throw new Error(`${file}: 无法解析 export 语句: ${text.trim().slice(0, 80)}`);
  }
  named.set(declMatch[2], declMatch[2]);
  return { named, isDefault: false, keep: text.replace(/^export\s+/, '') };
}

/** 数据文件（YAML）转成模块：把解析结果内联成 JS 字面量 */
function loadDataModule(file) {
  const raw = fs.readFileSync(file, 'utf8');
  let data;
  try {
    data = yaml.load(raw);
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)}: YAML 解析失败: ${e.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${path.relative(ROOT, file)}: 顶层必须是映射（键值对）`);
  }

  // 变量名由文件名派生：zju-override.yaml -> zju_override
  const name = path.basename(file).replace(/\.ya?ml$/i, '').replace(/[^A-Za-z0-9_$]/g, '_');
  if (!/^[A-Za-z_$]/.test(name)) {
    throw new Error(`${path.relative(ROOT, file)}: 文件名派生出的标识符 "${name}" 非法`);
  }

  // U+2028/U+2029 在 JS 字符串里是换行符，会把字面量截断
  const json = JSON.stringify(data, null, 2)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

  return {
    file,
    isEntry: false,
    isData: true,
    code: raw,
    body: `const ${name} = ${json};\n`,
    imports: [],
    exportsMap: new Map([['default', name], [name, name]]),
    hasDefault: true,
    topLevelNames: new Set([name]),
  };
}

const isDataFile = (file) => /\.ya?ml$/i.test(file);

/** 读取并解析一个模块 */
function loadModule(file, isEntry) {
  if (isDataFile(file)) return loadDataModule(file);

  let code = fs.readFileSync(file, 'utf8');
  // 去掉 sourceMappingURL，内联后它已无意义
  code = code.replace(/^\/\/#\s*sourceMappingURL=.*$/gm, '');

  const stmts = scanStatements(code);
  const imports = [];
  const exportsMap = new Map();
  let hasDefault = false;
  let body = '';
  let cursor = 0;

  for (const st of stmts) {
    body += code.slice(cursor, st.start);
    cursor = st.end;

    if (st.kind === 'import') {
      const { source, specifiers } = parseImport(st.text, file);
      imports.push({ source, specifiers, resolved: resolveSpecifier(source, file) });
    } else {
      const parsed = parseExport(st.text, file, isEntry);
      for (const [k, v] of parsed.named) exportsMap.set(k, v);
      if (parsed.isDefault) hasDefault = true;
      body += parsed.keep;
    }
  }
  body += code.slice(cursor);

  return {
    file,
    isEntry,
    isData: false,
    code,
    body,
    imports,
    exportsMap,
    hasDefault,
    topLevelNames: collectTopLevelNames(code, stmts),
  };
}

/* ──────────────────────────── 依赖图 ──────────────────────────── */

function buildGraph(entry) {
  const modules = new Map();   // realpath -> module
  const order = [];            // 拓扑序（依赖在前）
  const visiting = new Set();

  function visit(file, isEntry) {
    const real = fs.realpathSync(file);
    // 循环检测必须在缓存命中之前：模块一旦开始解析就会被记入 modules，
    // 若先查缓存，环回到自身时会命中半成品而不报错。
    if (visiting.has(real)) {
      throw new Error(`检测到循环依赖: ${path.relative(ROOT, real)}`);
    }
    if (modules.has(real)) return modules.get(real);

    visiting.add(real);
    const mod = loadModule(real, isEntry);
    modules.set(real, mod);

    for (const imp of mod.imports) {
      imp.dep = visit(imp.resolved, false);
    }

    visiting.delete(real);
    order.push(mod);
    return mod;
  }

  const entryMod = visit(entry, true);
  return { modules, order, entryMod };
}

/* ──────────────────────────── 校验 ──────────────────────────── */

function validate(graph) {
  const errors = [];

  // 1. 每个 import 都能在目标模块里找到对应导出
  for (const mod of graph.order) {
    for (const imp of mod.imports) {
      for (const sp of imp.specifiers) {
        if (!imp.dep.exportsMap.has(sp.imported)) {
          const avail = [...imp.dep.exportsMap.keys()].join(', ') || '(无)';
          errors.push(
            `${path.relative(ROOT, mod.file)}: 从 ${imp.source} 导入 "${sp.imported}"，` +
            `但该模块只导出: ${avail}`
          );
        }
      }
    }
  }

  // 2. 跨模块顶层重名。所有模块会拼进同一个作用域，重名会静默改变语义
  const owner = new Map();
  for (const mod of graph.order) {
    for (const name of mod.topLevelNames) {
      const rel = path.relative(ROOT, mod.file);
      if (owner.has(name) && owner.get(name) !== rel) {
        errors.push(`顶层名 "${name}" 同时定义于 ${owner.get(name)} 和 ${rel}，拼接后会冲突`);
      } else {
        owner.set(name, rel);
      }
    }
  }

  // 3. 入口必须导出 default（Cloudflare Pages Function 的约定）
  if (!graph.entryMod.hasDefault) {
    errors.push(`入口 ${path.relative(ROOT, ENTRY)} 缺少 export default`);
  }

  return errors;
}

/* ──────────────────────────── 输出 ──────────────────────────── */

function emit(graph) {
  const banner = `/**
 * zjumihomo —— 单文件 Cloudflare Worker
 *
 * 本文件由 build/build.mjs 从 src/ 自动生成，请勿直接编辑。
 * 修改源码请改 src/ 下的文件，然后运行: npm run build
 *
 * 自包含：无 import，无外部依赖（js-yaml 已内联），可直接粘贴部署。
 */
`;

  const parts = [banner];
  for (const mod of graph.order) {
    const rel = path.relative(ROOT, mod.file);
    const rule = '─'.repeat(Math.max(4, 66 - rel.length));
    parts.push(`\n/* ${rule} ${rel} */\n`);
    parts.push(mod.body.replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n');
  }

  return parts.join('');
}

/* ──────────────────────────── 主流程 ──────────────────────────── */

function main() {
  if (!fs.existsSync(ENTRY)) throw new Error(`入口不存在: ${ENTRY}`);

  let graph;
  try {
    graph = buildGraph(ENTRY);
  } catch (e) {
    console.error('构建失败：\n');
    console.error('  ✗ ' + e.message + '\n');
    process.exit(1);
  }

  const errors = validate(graph);
  if (errors.length) {
    console.error('构建失败：\n');
    for (const e of errors) console.error('  ✗ ' + e);
    console.error('');
    process.exit(1);
  }

  const out = emit(graph);

  // 产物必须仍然是合法 ESM 且不含外部 import
  if (!/^export default\s/m.test(out)) throw new Error('产物缺少 export default');
  const strayImport = out.match(/^\s*import\s+[^(]/m);
  if (strayImport) throw new Error('产物中仍存在未处理的 import: ' + strayImport[0].trim());

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);

  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log('构建完成 -> ' + path.relative(ROOT, OUT));
  console.log('');
  for (const mod of graph.order) {
    console.log('  ' + path.relative(ROOT, mod.file).padEnd(34) + kb(Buffer.byteLength(mod.body)));
  }
  console.log('');
  console.log(`  共 ${graph.order.length} 个模块，产物 ${kb(Buffer.byteLength(out))}`);
}

main();
