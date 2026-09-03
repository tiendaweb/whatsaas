#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = process.env.NEXT_DIST_DIR || '.next-build';
const activeDistDir = process.env.NEXT_ACTIVE_DIST_DIR || '.next';
const previousDistDir = process.env.NEXT_PREVIOUS_DIST_DIR || '.next-previous';
const maxOldSpaceSizeMb = process.env.NEXT_BUILD_MAX_OLD_SPACE_SIZE_MB || '4096';

const inheritedNodeOptions = process.env.NODE_OPTIONS || '';
const buildNodeOptions = inheritedNodeOptions.includes('--max-old-space-size')
  ? inheritedNodeOptions
  : `${inheritedNodeOptions} --max-old-space-size=${maxOldSpaceSizeMb}`.trim();

function resolveInsideRoot(dir) {
  const resolved = path.resolve(projectRoot, dir);
  const relative = path.relative(projectRoot, resolved);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path outside project root: ${dir}`);
  }

  return resolved;
}

function copyMissingTree(source, target) {
  if (!fs.existsSync(source)) return;
  const stat = fs.statSync(source);
  if (!stat.isDirectory()) return;

  fs.mkdirSync(target, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      copyMissingTree(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile() || fs.existsSync(targetPath)) continue;
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function preserveActiveStatic() {
  const activeStatic = path.join(resolveInsideRoot(activeDistDir), 'static');
  const previousStatic = path.join(resolveInsideRoot(previousDistDir), 'static');
  copyMissingTree(activeStatic, previousStatic);
}

function mergePreservedStatic() {
  const outputStatic = path.join(resolveInsideRoot(distDir), 'static');
  const activeStatic = path.join(resolveInsideRoot(activeDistDir), 'static');
  const previousStatic = path.join(resolveInsideRoot(previousDistDir), 'static');

  copyMissingTree(previousStatic, outputStatic);
  if (path.resolve(outputStatic) !== path.resolve(activeStatic)) {
    copyMissingTree(activeStatic, outputStatic);
  }
}

preserveActiveStatic();

const nextBuildArgs = ['exec', 'next', 'build', '--turbopack'];

if (process.env.NEXT_DEBUG_BUILD_PATHS) {
  nextBuildArgs.push('--debug-build-paths', process.env.NEXT_DEBUG_BUILD_PATHS);
}

const result = spawnSync('pnpm', nextBuildArgs, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_DIST_DIR: distDir,
    NODE_OPTIONS: buildNodeOptions,
  },
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

mergePreservedStatic();
