import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../harness/packaged-fixture.js';

test.describe('Packaged portable release acceptance', () => {
  test('launches the isolated portable executable and preserves Data across relaunch', async ({
    packagedApp,
  }) => {
    const firstExecutable = await packagedApp.app.evaluate(() => process.execPath);
    const firstPid = await packagedApp.app.evaluate(() => process.pid);

    expect(path.resolve(firstExecutable)).toBe(path.resolve(packagedApp.executablePath));
    expect(path.dirname(firstExecutable)).toBe(packagedApp.isolatedPortableRoot);
    expect(fs.existsSync(packagedApp.dataPath)).toBe(true);
    expect(fs.existsSync(path.join(packagedApp.isolatedPortableRoot, 'portable.dat'))).toBe(true);

    const persistenceProbe = path.join(packagedApp.dataPath, 'packaged-e2e-persistence-probe.json');
    const probeContents = JSON.stringify({ harness: 'packaged-acceptance', persistent: true });
    fs.writeFileSync(persistenceProbe, probeContents, 'utf8');

    const relaunched = await packagedApp.relaunch();
    const secondExecutable = await relaunched.app.evaluate(() => process.execPath);
    const secondPid = await relaunched.app.evaluate(() => process.pid);

    expect(secondPid).not.toBe(firstPid);
    expect(path.resolve(secondExecutable)).toBe(path.resolve(packagedApp.executablePath));
    expect(fs.readFileSync(persistenceProbe, 'utf8')).toBe(probeContents);
    expect(
      fs.existsSync(
        path.join(packagedApp.sourcePortableRoot, 'Data', path.basename(persistenceProbe)),
      ),
    ).toBe(false);
    await expect(relaunched.mainWindow.locator('#root')).toBeAttached();
  });
});
