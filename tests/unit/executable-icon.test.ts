import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));

it('embeds the application icon in a Windows executable and detects a default icon', async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'macro-executable-icon-'));
  const executable = path.join(temporaryRoot, 'MacroRecorder.exe');
  const icon = path.join(root, 'apps/desktop/resources/icon.ico');
  fs.copyFileSync(
    path.join(root, 'apps/desktop/node_modules/electron/dist/electron.exe'),
    executable,
  );
  try {
    const { setExecutableIcon, verifyExecutableIcon } =
      require('../../scripts/lib/executable-icon.cjs') as {
        setExecutableIcon(executable: string, icon: string): Promise<void>;
        verifyExecutableIcon(executable: string, icon: string): void;
      };
    expect(() => verifyExecutableIcon(executable, icon)).toThrow();
    await setExecutableIcon(executable, icon);
    expect(() => verifyExecutableIcon(executable, icon)).not.toThrow();
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
