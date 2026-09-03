import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components', 'lib'];
const locales = ['es', 'en', 'pt'];
const extensions = new Set(['.js', '.jsx', '.ts', '.tsx']);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', '.next', 'node_modules'].includes(entry.name)) continue;

    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(filePath, files);
    } else if (extensions.has(path.extname(entry.name))) {
      files.push(filePath);
    }
  }

  return files;
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function getMessage(messages, dottedPath) {
  return dottedPath.split('.').reduce((value, key) => {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }

    return undefined;
  }, messages);
}

function findScope(source, index) {
  const start = source.lastIndexOf('{', index);
  if (start === -1) return [0, source.length];

  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return [start, i + 1];
  }

  return [start, source.length];
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const messagesByLocale = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(fs.readFileSync(`messages/${locale}.json`, 'utf8'))
  ])
);

const refs = [];

for (const file of roots.flatMap((root) => walk(root))) {
  const source = fs.readFileSync(file, 'utf8');
  const bindings = [];
  let match;

  const directBinding =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

  while ((match = directBinding.exec(source))) {
    bindings.push({
      name: match[1],
      namespace: match[2],
      index: match.index
    });
  }

  const objectBinding =
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*await\s+getTranslations\(\s*\{[^}]*namespace\s*:\s*['"`]([^'"`]+)['"`][^}]*\}\s*\)/gs;

  while ((match = objectBinding.exec(source))) {
    bindings.push({
      name: match[1],
      namespace: match[2],
      index: match.index
    });
  }

  for (const binding of bindings) {
    const [start, end] = findScope(source, binding.index);
    const scopedSource = source.slice(start, end);
    const call = new RegExp(
      `\\b${escapeRegex(binding.name)}\\s*(?:\\.rich|\\.markup)?\\(\\s*(['"\`])([^'"\`]+)\\1`,
      'g'
    );

    let callMatch;
    while ((callMatch = call.exec(scopedSource))) {
      const key = callMatch[2];
      if (key.includes('${')) continue;

      refs.push({
        file,
        line: lineOf(source, start + callMatch.index),
        namespace: binding.namespace,
        key
      });
    }
  }
}

const missing = [];

for (const ref of refs) {
  for (const locale of locales) {
    const fullPath = `${ref.namespace}.${ref.key}`;
    if (getMessage(messagesByLocale[locale], fullPath) === undefined) {
      missing.push({ ...ref, locale, fullPath });
    }
  }
}

if (missing.length > 0) {
  const grouped = new Map();

  for (const item of missing) {
    const key = `${item.locale}:${item.fullPath}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(`${item.file}:${item.line}`);
  }

  console.error(`Missing i18n messages: ${grouped.size}`);
  for (const [key, locations] of [...grouped.entries()].sort()) {
    console.error(`${key} <- ${[...new Set(locations)].join(', ')}`);
  }

  process.exit(1);
}

console.log(`i18n messages OK (${refs.length} references checked).`);
