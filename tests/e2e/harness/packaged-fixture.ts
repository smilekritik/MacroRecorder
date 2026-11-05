import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  _electron as electron,
  expect,
  test as base,
  type ElectronApplication,
  type Page,
} from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PackagedLaunch {
  readonly app: ElectronApplication;
  readonly mainWindow: Page;
}

export interface PackagedAppContext extends PackagedLaunch {
  readonly sourcePortableRoot: string;
  readonly isolatedPortableRoot: string;
  readonly executablePath: string;
  readonly dataPath: string;
  readonly relaunch: () => Promise<PackagedLaunch>;
}

function isInsideDataDirectory(sourceRoot: string, candidate: string): boolean {
  const relative = path.relative(sourceRoot, candidate);
  return relative === 'Data' || relative.startsWith(`Data${path.sep}`);
}

async function launchPackagedExecutable(
  executablePath: string,
  isolatedLocalAppData: string,
): Promise<PackagedLaunch> {
  const app = await electron.launch({
    executablePath,
    // A separate profile keeps the test copy clear of the single-instance lock of an open copy.
    args: ['--portable', `--user-data-dir=${path.join(isolatedLocalAppData, 'UserData')}`],
    env: {
      ...process.env,
      APPDATA: path.join(isolatedLocalAppData, 'Roaming'),
      LOCALAPPDATA: path.join(isolatedLocalAppData, 'Local'),
      NODE_ENV: 'production',
      MACRO_RECORDER_NO_SHELL_INTEGRATION: '1',
    },
  });

  try {
    const mainWindow = await app.firstWindow({ timeout: 30_000 });
    await mainWindow.waitForSelector('#root', { state: 'attached', timeout: 30_000 });
    return { app, mainWindow };
  } catch (error) {
    await app.close().catch(() => undefined);
    throw error;
  }
}

export const test = base.extend<{ packagedApp: PackagedAppContext }>({
  packagedApp: async ({}, use) => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const sourcePortableRoot = path.resolve(
      process.env['MACRO_RECORDER_PACKAGED_DIR'] ??
        path.join(workspaceRoot, 'artifacts/packages/MacroRecorder-portable-win-x64'),
    );
    const sourceExecutable = path.join(sourcePortableRoot, 'MacroRecorder.exe');
    const sourcePortableMarker = path.join(sourcePortableRoot, 'portable.dat');

    if (!fs.existsSync(sourceExecutable) || !fs.existsSync(sourcePortableMarker)) {
      throw new Error(
        `Packaged acceptance requires the portable distribution at ${sourcePortableRoot}. ` +
          'Run the production build and package steps first; the development fake harness is not an acceptance substitute.',
      );
    }

    const sandboxRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'macro-recorder-packaged-e2e-'),
    );
    const isolatedPortableRoot = path.join(sandboxRoot, 'portable');
    const isolatedLocalAppData = path.join(sandboxRoot, 'profile');

    await fs.promises.cp(sourcePortableRoot, isolatedPortableRoot, {
      recursive: true,
      errorOnExist: true,
      force: false,
      filter: (candidate) => !isInsideDataDirectory(sourcePortableRoot, candidate),
    });
    await fs.promises.mkdir(isolatedLocalAppData, { recursive: true });

    const executablePath = path.join(isolatedPortableRoot, 'MacroRecorder.exe');
    const dataPath = path.join(isolatedPortableRoot, 'Data');
    let launch = await launchPackagedExecutable(executablePath, isolatedLocalAppData);

    const relaunch = async (): Promise<PackagedLaunch> => {
      await launch.app.close();
      launch = await launchPackagedExecutable(executablePath, isolatedLocalAppData);
      return launch;
    };

    try {
      await use({
        get app() {
          return launch.app;
        },
        get mainWindow() {
          return launch.mainWindow;
        },
        sourcePortableRoot,
        isolatedPortableRoot,
        executablePath,
        dataPath,
        relaunch,
      });
    } finally {
      await launch.app.close().catch(() => undefined);
      // Windows keeps the exe's files locked for a moment after the process exits.
      await fs.promises.rm(sandboxRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
  },
});

export { expect };
