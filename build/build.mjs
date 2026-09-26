#!/usr/bin/env node
/** 使用 esbuild 将 Pages Function 打包成单文件 ESM。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { build } from 'esbuild';

const ROOT = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const ENTRY = path.join(ROOT, 'src/index.js');
const OUT = path.join(ROOT, 'dist/_worker.js');

const yamlPlugin = {
  name: 'yaml-inline',
  setup(api) {
    api.onLoad({ filter: /\.ya?ml$/i }, async (args) => {
      const source = await fs.promises.readFile(args.path, 'utf8');
      const value = yaml.load(source);
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${path.relative(ROOT, args.path)}: YAML 顶层必须是映射`);
      }
      return { contents: `export default ${JSON.stringify(value)};`, loader: 'js' };
    });
  },
};

const banner = `/**
 * zjumihomo —— 单文件 Cloudflare Pages Function
 * 本文件由 esbuild 从 src/ 自动生成，请勿直接编辑。
 */`;

try {
  await build({
    absWorkingDir: ROOT,
    entryPoints: [ENTRY],
    outfile: OUT,
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    plugins: [yamlPlugin],
    banner: { js: banner },
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  });
  const output = await fs.promises.readFile(OUT, 'utf8');
  if (!/^\s*(?:export default\b|export\s*\{[^}]*\bas\s+default\b)/m.test(output)) throw new Error('产物缺少 export default');
  if (/^\s*import\s+[^(']/m.test(output)) throw new Error('产物仍包含未打包的外部 import');
  console.log(`构建完成 -> ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(output) / 1024).toFixed(1)} KB)`);
} catch (error) {
  console.error(`构建失败：\n  ✗ ${error.message}`);
  process.exitCode = 1;
}
