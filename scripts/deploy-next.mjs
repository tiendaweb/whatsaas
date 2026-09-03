#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = process.env.DEPLOY_BASE_URL || 'http://127.0.0.1:3000';
const buildCommand = process.env.DEPLOY_BUILD_COMMAND || 'pnpm build';
const restartCommand = process.env.DEPLOY_RESTART_COMMAND
  || 'docker compose up -d --force-recreate app';
const projectRoot = process.cwd();
const activeDistDir = process.env.DEPLOY_ACTIVE_DIST_DIR || '.next';
const buildDistDir = process.env.DEPLOY_BUILD_DIST_DIR || '.next-deploy';
const previousDistDir = process.env.DEPLOY_PREVIOUS_DIST_DIR || '.next-previous';
const atomicBuild = process.env.DEPLOY_ATOMIC_BUILD !== '0';
const verifyPaths = (process.env.DEPLOY_VERIFY_PATHS || '/es/sign-in,/es/dashboard,/es/plugins/mini-apps/business-woman-planner')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);
const protectedPaths = (process.env.DEPLOY_PROTECTED_PATHS || '/es/admin/resellers,/es/reseller')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean);
const readyPath = process.env.DEPLOY_READY_PATH || verifyPaths[0] || '/';
const readyTimeoutMs = Number(process.env.DEPLOY_READY_TIMEOUT_MS || 60000);
const cookie = process.env.DEPLOY_COOKIE || '';

function runStep(label, command, extraEnv = {}) {
  if (!command) return;

  console.log(`\n==> ${label}`);
  console.log(command);

  const result = spawnSync(command, {
    shell: true,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function resolveDistDir(distDir) {
  const resolved = path.resolve(projectRoot, distDir);
  const relative = path.relative(projectRoot, resolved);

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe distDir outside project root: ${distDir}`);
  }

  return resolved;
}

function removeDir(distDir) {
  fs.rmSync(resolveDistDir(distDir), { recursive: true, force: true });
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

function mergeExistingStaticAssets() {
  const activeStatic = path.join(resolveDistDir(activeDistDir), 'static');
  const buildStatic = path.join(resolveDistDir(buildDistDir), 'static');

  copyMissingTree(activeStatic, buildStatic);
}

function swapBuiltDistDir() {
  const activeDir = resolveDistDir(activeDistDir);
  const buildDir = resolveDistDir(buildDistDir);
  const previousDir = resolveDistDir(previousDistDir);

  const requiredBuildFiles = [
    'BUILD_ID',
    'build-manifest.json',
    'routes-manifest.json',
    'server',
    'static',
  ];

  for (const requiredFile of requiredBuildFiles) {
    if (!fs.existsSync(path.join(buildDir, requiredFile))) {
      throw new Error(`Build distDir is incomplete; missing ${requiredFile}: ${buildDistDir}`);
    }
  }

  fs.rmSync(previousDir, { recursive: true, force: true });

  if (fs.existsSync(activeDir)) {
    fs.renameSync(activeDir, previousDir);
  }

  try {
    fs.renameSync(buildDir, activeDir);
  } catch (error) {
    if (!fs.existsSync(activeDir) && fs.existsSync(previousDir)) {
      fs.renameSync(previousDir, activeDir);
    }

    throw error;
  }
}

function buildNextApp() {
  if (!atomicBuild) {
    runStep('Build Next app', buildCommand);
    return;
  }

  if (activeDistDir === buildDistDir || activeDistDir === previousDistDir || buildDistDir === previousDistDir) {
    throw new Error('Deploy distDir values must be unique.');
  }

  removeDir(buildDistDir);
  runStep('Build Next app', buildCommand, { NEXT_DIST_DIR: buildDistDir });
  mergeExistingStaticAssets();
  swapBuiltDistDir();
}

function absoluteUrl(path) {
  return new URL(path, baseUrl).toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  const deadline = Date.now() + readyTimeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(absoluteUrl(readyPath), {
        method: 'HEAD',
        redirect: 'manual',
      });

      if (response.status < 500) {
        console.log(`Server is ready at ${absoluteUrl(readyPath)} (HTTP ${response.status})`);
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(1000);
  }

  throw new Error(`Server did not become ready within ${readyTimeoutMs}ms: ${lastError?.message || 'unknown error'}`);
}

function extractNextAssets(html) {
  const assets = new Set();
  const attrPattern = /\b(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g;

  for (const match of html.matchAll(attrPattern)) {
    const assetUrl = new URL(match[1], baseUrl);
    if (assetUrl.pathname.startsWith('/_next/static/')) {
      assets.add(`${assetUrl.pathname}${assetUrl.search}`);
    }
  }

  return [...assets];
}

async function assertAsset(assetPath) {
  const url = absoluteUrl(assetPath);
  const response = await fetch(url, { method: 'HEAD', redirect: 'manual' });

  if (response.ok) return;

  // Some hosts do not serve HEAD for static files. Fall back to a ranged GET.
  const getResponse = await fetch(url, {
    method: 'GET',
    headers: { Range: 'bytes=0-0' },
    redirect: 'manual',
  });

  if (!getResponse.ok && getResponse.status !== 206) {
    throw new Error(`Missing static asset ${assetPath}: HTTP ${getResponse.status}`);
  }
}

async function verifyPath(path) {
  const headers = cookie ? { Cookie: cookie } : {};
  const response = await fetch(absoluteUrl(path), { headers, redirect: 'follow' });

  if (!response.ok) {
    throw new Error(`Verification path ${path} failed: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    console.log(`Skipping asset scan for ${path}; content-type is ${contentType || 'unknown'}`);
    return;
  }

  const html = await response.text();
  const assets = extractNextAssets(html);

  await Promise.all(assets.map(assertAsset));
  console.log(`Verified ${path} -> ${response.url} (${assets.length} Next static assets)`);
}

async function verifyProtectedPath(path) {
  const headers = cookie ? { Cookie: cookie } : {};
  const response = await fetch(absoluteUrl(path), {
    headers,
    redirect: cookie ? 'follow' : 'manual',
  });

  if (!cookie) {
    const location = response.headers.get('location') || '';
    if (response.status < 300 || response.status >= 400 || !location.includes('/sign-in')) {
      throw new Error(
        `Protected path ${path} did not enforce authentication: HTTP ${response.status} location=${location || 'none'}`,
      );
    }
    console.log(`Verified auth gate ${path} -> ${location} (HTTP ${response.status})`);
    return;
  }

  if (!response.ok || response.url.includes('/sign-in')) {
    throw new Error(`Authenticated path ${path} failed: HTTP ${response.status} url=${response.url}`);
  }

  console.log(`Verified authenticated path ${path} -> ${response.url}`);
}

async function main() {
  if (process.env.DEPLOY_SKIP_BUILD !== '1') {
    buildNextApp();
  }

  if (process.env.DEPLOY_SKIP_RESTART !== '1') {
    runStep('Restart app process', restartCommand);
  }

  console.log('\n==> Verify served build');
  await waitForServer();

  for (const path of verifyPaths) {
    await verifyPath(path);
  }

  for (const path of protectedPaths) {
    await verifyProtectedPath(path);
  }

  console.log('\nDeploy verification passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
