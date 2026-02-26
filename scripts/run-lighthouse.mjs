import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const cwd = process.cwd();
const isWindows = process.platform === 'win32';
const localBin = resolve(cwd, 'node_modules', '.bin', isWindows ? 'lhci.cmd' : 'lhci');
const localCli = resolve(cwd, 'node_modules', '@lhci', 'cli', 'src', 'cli.js');
const strictMode = process.env.LIGHTHOUSE_STRICT === '1' || process.env.CI === 'true';
const configArg = '--config=./lighthouserc.json';
const require = createRequire(import.meta.url);

function runCommand(command, args, options = {}) {
  const { quietMissingCommand = false } = options;
  return new Promise((resolveResult) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit',
      shell: false,
    });

    child.on('error', (error) => {
      if (!(quietMissingCommand && 'code' in error && error.code === 'ENOENT')) {
        console.error(error.message);
      }
      resolveResult(1);
    });

    child.on('exit', (code) => {
      resolveResult(code ?? 1);
    });
  });
}

async function main() {
  // LHCI healthcheck fails when Chrome is missing; fallback to Playwright's bundled Chromium.
  if (!process.env.CHROME_PATH) {
    try {
      const { chromium } = require('playwright');
      const chromiumPath = chromium.executablePath();
      if (chromiumPath && existsSync(chromiumPath)) {
        process.env.CHROME_PATH = chromiumPath;
        process.env.LIGHTHOUSE_CHROMIUM_PATH = chromiumPath;
      }
    } catch {
      // Ignore and allow LHCI fallback behavior when Playwright is unavailable.
    }
  }

  if (existsSync(localBin)) {
    const code = await runCommand(localBin, ['autorun', configArg]);
    process.exit(code);
  }

  if (existsSync(localCli)) {
    const code = await runCommand(process.execPath, [localCli, 'autorun', configArg]);
    process.exit(code);
  }

  // Support globally installed lhci when project-local dependency is absent.
  const globalCode = await runCommand('lhci', ['autorun', configArg], { quietMissingCommand: true });
  if (globalCode === 0) {
    process.exit(0);
  }

  if (!strictMode) {
    console.log(
      'Lighthouse skipped: lhci is not installed locally. Set LIGHTHOUSE_STRICT=1 to enforce, or install @lhci/cli.',
    );
    process.exit(0);
  }

  const code = await runCommand('npx', ['-y', '@lhci/cli@0.15.x', 'autorun', configArg]);
  if (code !== 0) {
    console.error(
      'Lighthouse strict mode failed: install @lhci/cli locally (npm i -D @lhci/cli) or ensure global lhci is available on PATH.',
    );
  }
  process.exit(code);
}

await main();
