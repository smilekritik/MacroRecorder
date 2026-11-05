/**
 * Macro Recorder Production Verification Engine.
 * Verifies production packages, size budgets, exclusion rules,
 * checksum integrity, and runtime loading guarantees.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { verifyExecutableIcon } = require('./lib/executable-icon.cjs');

function logMessage(msg, logFile) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line + '\n', 'utf-8');
  }
}

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let bytesRead = 0;
    let pos = 0;
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, pos)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
      pos += bytesRead;
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

function getDirectorySize(dirPath) {
  let total = 0;
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        total += fs.statSync(full).size;
      }
    }
  }
  walk(dirPath);
  return total;
}

function scanFiles(dirPath) {
  const results = [];
  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        results.push(full);
      }
    }
  }
  walk(dirPath);
  return results;
}

async function verifyProduction(options = {}) {
  const startTime = Date.now();
  const wsRoot = path.resolve(options.workspaceRoot || path.join(__dirname, '..'));
  const artifactsDir = path.join(wsRoot, 'artifacts');
  const logFile = path.join(artifactsDir, 'verify.log');

  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }

  logMessage('=== Starting Macro Recorder Production Verification ===', logFile);

  const configPath = path.join(__dirname, 'package-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const packagesDir = path.join(artifactsDir, 'packages');
  const portableDir = path.join(packagesDir, config.portableDirName);
  const portableZip = path.join(packagesDir, config.portableZipName);
  const installerExe = path.join(packagesDir, config.installerName);
  const shaSumsFile = path.join(packagesDir, 'SHA256SUMS.txt');

  const failures = [];

  const applicationIcon = path.join(wsRoot, 'apps/desktop/resources/icon.ico');
  for (const executable of [path.join(portableDir, config.executableName), installerExe]) {
    try {
      verifyExecutableIcon(executable, applicationIcon);
      logMessage(`  [PASS] Embedded application icon: ${executable}`, logFile);
    } catch (error) {
      const message = `EXECUTABLE ICON FAILURE: ${error.message || error}`;
      logMessage(`  [FAIL] ${message}`, logFile);
      failures.push(message);
    }
  }

  // Check 1: Mandatory package artifacts exist
  logMessage('Checking release artifact deliverables...', logFile);
  const requiredArtifacts = [
    { name: 'Portable Directory', path: portableDir, isDir: true },
    { name: 'Portable Executable', path: path.join(portableDir, config.executableName), isDir: false },
    { name: 'Application ASAR', path: path.join(portableDir, 'resources/app.asar'), isDir: false },
    { name: 'Unpacked Native Addon', path: path.join(portableDir, 'resources/app.asar.unpacked/macro_recorder_native.node'), isDir: false },
    { name: 'Embedded HidHide Installer', path: path.join(portableDir, 'resources/drivers/HidHide_1.5.230_x64.exe'), isDir: false },
    { name: 'Embedded ViGEmBus Installer', path: path.join(portableDir, 'resources/drivers/ViGEmBus_1.22.0_x64_x86_arm64.exe'), isDir: false },
    { name: 'Portable ZIP Archive', path: portableZip, isDir: false },
    { name: 'Application License', path: path.join(portableDir, 'LICENSE'), isDir: false },
    { name: 'Third-party Notices', path: path.join(portableDir, 'THIRD_PARTY_NOTICES.md'), isDir: false },
    { name: 'Dependency License Texts', path: path.join(portableDir, 'THIRD_PARTY_LICENSES.txt'), isDir: false },
    { name: 'Electron License', path: path.join(portableDir, 'LICENSE.electron.txt'), isDir: false },
    { name: 'Chromium Notices', path: path.join(portableDir, 'LICENSES.chromium.html'), isDir: false },
    { name: 'Windows Installer Executable', path: installerExe, isDir: false },
    { name: 'SHA256 Checksum Manifest', path: shaSumsFile, isDir: false },
  ];

  for (const art of requiredArtifacts) {
    if (!fs.existsSync(art.path)) {
      const err = `MISSING ARTIFACT: ${art.name} expected at ${art.path}`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    } else {
      const stat = fs.statSync(art.path);
      logMessage(`  [PASS] ${art.name}: ${art.path} (${(stat.size / 1024).toFixed(1)} KB)`, logFile);
    }
  }

  // Check 2: Exclusion Rules Audit (No source maps, no tests, no fixtures, no binaries, no .NET)
  logMessage('Verifying package exclusion rules...', logFile);
  if (fs.existsSync(portableDir)) {
    const allFiles = scanFiles(portableDir);

    // Rule A: No source maps
    const mapFiles = allFiles.filter(f => f.endsWith('.map'));
    if (mapFiles.length > 0) {
      const err = `EXCLUSION VIOLATION: Packaged distribution contains ${mapFiles.length} source map (.map) files`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    } else {
      logMessage('  [PASS] Zero source map files found in package', logFile);
    }

    // Rule B: No tests or test specs
    const testFiles = allFiles.filter(f => f.includes('.test.') || f.includes('.spec.') || f.includes('/tests/') || f.includes('\\tests\\'));
    if (testFiles.length > 0) {
      const err = `EXCLUSION VIOLATION: Packaged distribution contains ${testFiles.length} test/spec files`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    } else {
      logMessage('  [PASS] Zero test or spec files found in package', logFile);
    }

    // Rule C: No test fixtures
    const fixtureFiles = allFiles.filter(f => f.toLowerCase().includes('fixture'));
    if (fixtureFiles.length > 0) {
      const err = `EXCLUSION VIOLATION: Packaged distribution contains fixture files`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    } else {
      logMessage('  [PASS] Zero test fixture files found in package', logFile);
    }

    // Rule D: Locales pruned to allowed (en-US, ru)
    const localesDir = path.join(portableDir, 'locales');
    if (fs.existsSync(localesDir)) {
      const locales = fs.readdirSync(localesDir);
      const invalidLocales = locales.filter(l => !config.packaging.allowedLocales.includes(l));
      if (invalidLocales.length > 0) {
        const err = `EXCLUSION VIOLATION: Found ${invalidLocales.length} unpruned Electron locales: ${invalidLocales.join(', ')}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
      } else {
        logMessage(`  [PASS] Locales correctly pruned (retained: ${locales.join(', ')})`, logFile);
      }
    }

    // Rule E: No binaries or .NET runtime
    const csFiles = allFiles.filter(f => {
      const base = path.basename(f).toLowerCase();
      return base.endsWith('.cs') ||
             (base.endsWith('.dll') && (base.startsWith('macrorecorder.') || base.startsWith('system.') || base.startsWith('microsoft.'))) ||
             base.endsWith('.runtimeconfig.json') ||
             base.endsWith('.deps.json');
    });
    if (csFiles.length > 0) {
      const err = `EXCLUSION VIOLATION: Found legacy C# / .NET binaries in package: ${csFiles.join(', ')}`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    } else {
      logMessage('  [PASS] Zero C# binaries or .NET runtime files in distribution', logFile);
    }
  }

  // Check 3: Size Budgets Audit
  logMessage('Auditing package size budgets...', logFile);
  const portableSize = fs.existsSync(portableDir) ? getDirectorySize(portableDir) : 0;
  const installerSize = fs.existsSync(installerExe) ? fs.statSync(installerExe).size : 0;
  const nativeAddon = path.join(portableDir, 'resources/app.asar.unpacked/macro_recorder_native.node');
  const nativeSize = fs.existsSync(nativeAddon) ? fs.statSync(nativeAddon).size : 0;

  const maxPortableBytes = config.budgets.maxInstalledSizeMb * 1024 * 1024;
  const maxInstallerBytes = config.budgets.maxInstallerSizeMb * 1024 * 1024;
  const maxNativeBytes = config.budgets.maxNativeAddonSizeMb * 1024 * 1024;

  const portMb = (portableSize / (1024 * 1024)).toFixed(2);
  const instMb = (installerSize / (1024 * 1024)).toFixed(2);
  const natMb = (nativeSize / (1024 * 1024)).toFixed(2);

  if (portableSize > maxPortableBytes) {
    const err = `BUDGET EXCEEDED: Installed portable size (${portMb} MB) exceeds budget of ${config.budgets.maxInstalledSizeMb} MB`;
    logMessage(`  [FAIL] ${err}`, logFile);
    failures.push(err);
  } else {
    logMessage(`  [PASS] Installed portable footprint: ${portMb} MB <= ${config.budgets.maxInstalledSizeMb} MB`, logFile);
  }

  if (installerSize > maxInstallerBytes) {
    const err = `BUDGET EXCEEDED: Installer size (${instMb} MB) exceeds budget of ${config.budgets.maxInstallerSizeMb} MB`;
    logMessage(`  [FAIL] ${err}`, logFile);
    failures.push(err);
  } else {
    logMessage(`  [PASS] Windows x64 installer size: ${instMb} MB <= ${config.budgets.maxInstallerSizeMb} MB`, logFile);
  }

  if (nativeSize > maxNativeBytes) {
    const err = `BUDGET EXCEEDED: Native Rust addon size (${natMb} MB) exceeds budget of ${config.budgets.maxNativeAddonSizeMb} MB`;
    logMessage(`  [FAIL] ${err}`, logFile);
    failures.push(err);
  } else {
    logMessage(`  [PASS] Stripped Rust addon size: ${natMb} MB <= ${config.budgets.maxNativeAddonSizeMb} MB`, logFile);
  }

  // Check 4: Checksum Manifest Verification
  logMessage('Verifying SHA-256 integrity manifest...', logFile);
  if (fs.existsSync(shaSumsFile)) {
    const lines = fs.readFileSync(shaSumsFile, 'utf-8').split(/\r?\n/).filter(l => l.trim().length > 0);
    const expectedManifestEntries = [
      path.relative(packagesDir, installerExe),
      path.relative(packagesDir, portableZip),
      path.relative(packagesDir, path.join(portableDir, config.executableName)),
      path.relative(packagesDir, path.join(portableDir, 'resources/app.asar')),
      path.relative(packagesDir, path.join(portableDir, 'resources/app.asar.unpacked/macro_recorder_native.node')),
      path.relative(packagesDir, path.join(portableDir, 'resources/drivers/HidHide_1.5.230_x64.exe')),
      path.relative(packagesDir, path.join(portableDir, 'resources/drivers/ViGEmBus_1.22.0_x64_x86_arm64.exe')),
    ].map(entry => entry.replace(/\\/g, '/'));
    const manifestEntries = new Set();
    let matched = 0;

    if (lines.length === 0) {
      const err = 'CHECKSUM MANIFEST EMPTY: SHA256SUMS.txt contains zero entries';
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    }

    for (const line of lines) {
      const match = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
      if (!match) {
        const err = `CHECKSUM MANIFEST MALFORMED: ${line}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
        continue;
      }

      const expectedHash = match[1].toLowerCase();
      const relPath = match[2].trim().replace(/\\/g, '/');
      const fullPath = path.resolve(packagesDir, relPath);
      const relativeCheck = path.relative(packagesDir, fullPath);
      if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
        const err = `CHECKSUM PATH ESCAPES PACKAGE ROOT: ${relPath}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
        continue;
      }
      if (manifestEntries.has(relPath)) {
        const err = `CHECKSUM MANIFEST DUPLICATE: ${relPath}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
        continue;
      }
      manifestEntries.add(relPath);

      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        const err = `CHECKSUM TARGET MISSING: ${relPath}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
        continue;
      }

      const actualHash = calculateSha256(fullPath);
      if (actualHash.toLowerCase() === expectedHash) {
        matched++;
      } else {
        const err = `CHECKSUM MISMATCH: ${relPath} expected ${expectedHash} but computed ${actualHash}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
      }
    }

    for (const requiredEntry of expectedManifestEntries) {
      if (!manifestEntries.has(requiredEntry)) {
        const err = `CHECKSUM ENTRY MISSING: ${requiredEntry}`;
        logMessage(`  [FAIL] ${err}`, logFile);
        failures.push(err);
      }
    }

    if (matched === expectedManifestEntries.length && manifestEntries.size === expectedManifestEntries.length) {
      logMessage(`  [PASS] Verified all ${matched} required release artifact checksums against SHA256SUMS.txt`, logFile);
    } else {
      const err = `CHECKSUM COVERAGE INCOMPLETE: verified ${matched}/${expectedManifestEntries.length} required artifacts; manifest contains ${manifestEntries.size} unique entries`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    }
  }

  // Check 5: Packaged Executable Boot & Addon Verification
  logMessage('Verifying packaged executable and native addon runtime compatibility...', logFile);
  const packagedExe = path.join(portableDir, config.executableName);
  if (fs.existsSync(packagedExe)) {
    const testCode = `
      const path = require('path');
      const fs = require('fs');
      const asarPath = path.resolve('resources/app.asar');
      const entries = fs.readdirSync(asarPath);
      if (!entries.includes('main.cjs') || !entries.includes('index.html')) {
        throw new Error('ASAR missing core entry points');
      }
      const nativePath = path.resolve('resources/app.asar.unpacked/macro_recorder_native.node');
      const addon = require(nativePath);
      if (typeof addon.getMonotonicMicroseconds !== 'function' || typeof addon.releaseAllInputs !== 'function') {
        throw new Error('Native addon missing critical export functions');
      }
      process.exit(0);
    `;
    try {
      execSync(`"${packagedExe}" -e "${testCode.replace(/\n/g, ' ')}"`, {
        cwd: portableDir,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'pipe',
      });
      logMessage('  [PASS] Packaged executable booted ASAR and initialized native addon successfully', logFile);
    } catch (bootErr) {
      const err = `RUNTIME FAILURE: Packaged executable verification failed: ${bootErr.message || bootErr}`;
      logMessage(`  [FAIL] ${err}`, logFile);
      failures.push(err);
    }
  }

  const durationMs = Date.now() - startTime;
  logMessage('', logFile);
  if (failures.length > 0) {
    logMessage(`=== VERIFICATION FAILED: ${failures.length} issue(s) detected ===`, logFile);
    return { success: false, failures, durationMs };
  }

  logMessage(`=== VERIFICATION PASSED: All packaging and clean-machine criteria satisfied (${(durationMs / 1000).toFixed(2)}s) ===`, logFile);
  return { success: true, failures: [], durationMs };
}

if (require.main === module) {
  verifyProduction().then((res) => {
    if (!res.success) process.exit(1);
  }).catch((err) => {
    console.error('Verification error:', err);
    process.exit(1);
  });
}

module.exports = { verifyProduction };
