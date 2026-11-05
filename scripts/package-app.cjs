/**
 * Production Packager for Macro Recorder (Electron + Rust).
 * Assembles the production installer and portable distribution, packs ASAR,
 * unpacks native addon and drivers, prunes unused locales, applies metadata,
 * generates SHA-256 checksums, and audits package budgets.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');
const { AsarPacker } = require('./lib/asar.cjs');
const { setExecutableIcon, verifyExecutableIcon } = require('./lib/executable-icon.cjs');

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

function copyDirectory(src, dest, filterFn) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (filterFn && !filterFn(srcPath, entry)) continue;

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, filterFn);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function collectDependencyLicenses(wsRoot) {
  const sections = [];
  const desktopRoot = path.join(wsRoot, 'apps/desktop');
  const reactDomRoot = path.dirname(require.resolve('react-dom/package.json', { paths: [desktopRoot] }));
  for (const name of ['react', 'react-dom', 'scheduler']) {
    const manifestPath = require.resolve(`${name}/package.json`, { paths: [desktopRoot, reactDomRoot] });
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const license = fs.readFileSync(path.join(path.dirname(manifestPath), 'LICENSE'), 'utf8');
    sections.push(`${name} ${manifest.version}\n${license}`);
  }
  const metadata = JSON.parse(execFileSync('cargo', [
    'metadata', '--locked', '--offline', '--format-version=1', '--manifest-path',
    path.join(wsRoot, 'native/macro-recorder-native/Cargo.toml'),
  ], { encoding: 'utf8' }));
  for (const dependency of metadata.packages.filter(pkg => pkg.source)) {
    const directory = path.dirname(dependency.manifest_path);
    const files = fs.readdirSync(directory).filter(file => /^(LICENSE|COPYING|NOTICE)([.-]|$)/i.test(file)
      && fs.statSync(path.join(directory, file)).isFile());
    if (!files.length && dependency.repository === 'https://github.com/napi-rs/napi-rs') {
      sections.push(`${dependency.name} ${dependency.version}\n${fs.readFileSync(
        path.join(wsRoot, 'native/macro-recorder-native/LICENSE.napi-rs'), 'utf8')}`);
      continue;
    }
    if (!files.length) throw new Error(`No license text found for Rust dependency ${dependency.name}`);
    const texts = files.map(file => `${file}\n${fs.readFileSync(path.join(directory, file), 'utf8')}`);
    sections.push(`${dependency.name} ${dependency.version} (${dependency.license || 'see text'})\n${texts.join('\n')}`);
  }
  return sections.join('\n\n' + '='.repeat(72) + '\n\n') + '\n';
}

async function assemblePackages(options = {}) {
  const startTime = Date.now();
  const wsRoot = path.resolve(options.workspaceRoot || path.join(__dirname, '..'));
  const artifactsDir = path.join(wsRoot, 'artifacts');
  const logFile = path.join(artifactsDir, 'package.log');

  logMessage('=== Starting Macro Recorder Production Packaging ===', logFile);

  const configPath = path.join(__dirname, 'package-config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  const sfxPath = process.env.SEVENZIP_SFX_PATH || 'C:\\Program Files\\7-Zip\\7z.sfx';
  if (!fs.existsSync(sfxPath)) {
    throw new Error('7-Zip SFX module not found. Install 7-Zip x64 or set SEVENZIP_SFX_PATH to 7z.sfx.');
  }
  execSync('7z i', { stdio: 'pipe' });

  const electronDist = path.join(wsRoot, 'apps/desktop/node_modules/electron/dist');
  if (!fs.existsSync(electronDist)) {
    throw new Error(`Electron dist not found at ${electronDist}`);
  }

  const bundleDir = path.join(artifactsDir, 'desktop/bundle');
  if (!fs.existsSync(bundleDir)) {
    throw new Error(`Desktop bundle not found at ${bundleDir}. Run build script first.`);
  }

  const nativeAddonPath = path.join(artifactsDir, 'native/macro_recorder_native.node');
  if (!fs.existsSync(nativeAddonPath)) {
    throw new Error(`Native addon not found at ${nativeAddonPath}. Run build script first.`);
  }

  const packagesDir = path.join(artifactsDir, 'packages');
  fs.mkdirSync(packagesDir, { recursive: true });

  const stagingDir = path.join(packagesDir, 'staging');
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  // 1. Copy Electron Runtime & Prune Unused Locales
  logMessage('Copying Electron distribution runtime...', logFile);
  copyDirectory(electronDist, stagingDir, (fullPath, entry) => {
    // Exclude default_app.asar
    if (entry.name === 'default_app.asar') return false;
    return true;
  });

  // Prune Locales: keep ONLY allowedLocales (en-US.pak, ru.pak)
  const localesDir = path.join(stagingDir, 'locales');
  if (fs.existsSync(localesDir)) {
    const localeEntries = fs.readdirSync(localesDir);
    let removedLocales = 0;
    for (const file of localeEntries) {
      if (!config.packaging.allowedLocales.includes(file)) {
        fs.unlinkSync(path.join(localesDir, file));
        removedLocales++;
      }
    }
    logMessage(`Pruned ${removedLocales} unused Electron locales. Retained: ${config.packaging.allowedLocales.join(', ')}`, logFile);
  }

  // 2. Rename executable
  const origExe = path.join(stagingDir, 'electron.exe');
  const targetExe = path.join(stagingDir, config.executableName);
  if (fs.existsSync(origExe)) {
    fs.renameSync(origExe, targetExe);
    logMessage(`Renamed executable to: ${config.executableName}`, logFile);
  }
  const applicationIcon = path.join(wsRoot, 'apps/desktop/resources/icon.ico');
  setExecutableIcon(targetExe, applicationIcon);
  verifyExecutableIcon(targetExe, applicationIcon);
  logMessage('Embedded and verified the application icon in the executable.', logFile);

  // 3. ASAR Packaging and Unpack Rules
  logMessage('Packaging application files into app.asar with native unpack rules...', logFile);
  const resourcesDir = path.join(stagingDir, 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });

  const asarDest = path.join(resourcesDir, 'app.asar');
  const asarResult = AsarPacker.pack({
    srcDir: bundleDir,
    destFile: asarDest,
    unpackPatterns: config.packaging.unpackPatterns,
  });
  logMessage(`Packed app.asar (${(asarResult.packedSize / 1024).toFixed(1)} KB, ${asarResult.totalFiles} files)`, logFile);

  // Place native addon into unpacked directory
  const unpackedDir = `${asarDest}.unpacked`;
  fs.mkdirSync(unpackedDir, { recursive: true });
  const destNativeNode = path.join(unpackedDir, 'macro_recorder_native.node');
  fs.copyFileSync(nativeAddonPath, destNativeNode);
  logMessage(`Placed native addon into ASAR unpacked location: ${destNativeNode}`, logFile);

  // 4. Driver Embedding
  logMessage('Embedding driver installers for ViGEmBus and HidHide...', logFile);
  const driversDest = path.join(resourcesDir, 'drivers');
  fs.mkdirSync(driversDest, { recursive: true });

  const projectDriversDir = path.join(wsRoot, 'apps/desktop/resources/drivers');
  const localDriversDir = path.join(wsRoot, 'drivers');
  const rootDriversDir = path.join(wsRoot, '../drivers');

  for (const driver of config.drivers) {
    let srcFile = path.join(projectDriversDir, driver.filename);
    if (!fs.existsSync(srcFile)) {
      srcFile = path.join(localDriversDir, driver.filename);
    }
    if (!fs.existsSync(srcFile)) {
      srcFile = path.join(rootDriversDir, driver.filename);
    }
    if (fs.existsSync(srcFile)) {
      const destDriver = path.join(driversDest, driver.filename);
      fs.copyFileSync(srcFile, destDriver);
      logMessage(`Embedded driver installer: ${driver.filename} (${(fs.statSync(destDriver).size / (1024 * 1024)).toFixed(1)} MB)`, logFile);
    } else {
      logMessage(`Warning: Driver installer ${driver.filename} not found in candidate paths.`, logFile);
    }
  }

  // Also copy to root drivers folder for legacy lookup compatibility
  const rootAppDrivers = path.join(stagingDir, 'drivers');
  if (fs.existsSync(driversDest)) {
    copyDirectory(driversDest, rootAppDrivers);
  }

  // 5. Copy Icons, Metadata and License
  const electronLicense = path.join(stagingDir, 'LICENSE');
  if (fs.existsSync(electronLicense)) {
    fs.renameSync(electronLicense, path.join(stagingDir, 'LICENSE.electron.txt'));
  }
  for (const notice of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) {
    fs.copyFileSync(path.join(wsRoot, notice), path.join(stagingDir, notice));
  }
  fs.writeFileSync(path.join(stagingDir, 'THIRD_PARTY_LICENSES.txt'), collectDependencyLicenses(wsRoot), 'utf8');
  const iconIco = path.join(bundleDir, 'icon.ico');
  if (fs.existsSync(iconIco)) {
    fs.copyFileSync(iconIco, path.join(resourcesDir, 'icon.ico'));
    fs.copyFileSync(iconIco, path.join(stagingDir, 'icon.ico'));
  }
  const iconPng = path.join(bundleDir, 'icon.png');
  if (fs.existsSync(iconPng)) {
    fs.copyFileSync(iconPng, path.join(resourcesDir, 'icon.png'));
  }

  // 6. Assemble Portable Distribution
  logMessage('Creating portable distribution...', logFile);
  const portableDir = path.join(packagesDir, config.portableDirName);
  // Data holds the library of a portable build in use, so it is the one thing never touched.
  if (fs.existsSync(portableDir)) {
    for (const entry of fs.readdirSync(portableDir)) {
      if (entry === 'Data') continue;
      fs.rmSync(path.join(portableDir, entry), { recursive: true, force: true });
    }
  }
  copyDirectory(stagingDir, portableDir);

  // Place portable marker so app uses ./Data/ instead of %LocalAppData%
  fs.writeFileSync(path.join(portableDir, 'portable.dat'), 'MacroRecorder Portable Mode\n', 'utf-8');

  // Create Portable ZIP Archive
  const portableZipPath = path.join(packagesDir, config.portableZipName);
  if (fs.existsSync(portableZipPath)) {
    fs.unlinkSync(portableZipPath);
  }

  try {
    logMessage('Compressing portable distribution to ZIP...', logFile);
    execSync(`7z a -tzip -mx=7 "${portableZipPath}" "${portableDir}/*" -x!Data`, { stdio: 'pipe' });
    logMessage(`Portable ZIP archive created: ${portableZipPath} (${(fs.statSync(portableZipPath).size / (1024 * 1024)).toFixed(1)} MB)`, logFile);
  } catch (zipErr) {
    logMessage(`Warning: 7z compression failed, falling back to PowerShell: ${zipErr.message || zipErr}`, logFile);
    execSync(`powershell -NoProfile -Command "Get-ChildItem -LiteralPath '${portableDir}' -Exclude Data | Compress-Archive -DestinationPath '${portableZipPath}' -Force"`, { stdio: 'pipe' });
  }

  // 7. Assemble Installer Distribution
  logMessage('Creating Windows x64 Installer distribution...', logFile);
  const installerPayloadDir = path.join(packagesDir, 'installer-payload');
  if (fs.existsSync(installerPayloadDir)) {
    fs.rmSync(installerPayloadDir, { recursive: true, force: true });
  }
  copyDirectory(stagingDir, installerPayloadDir);

  // Copy installer payload setup script
  const setupTemplate = path.join(__dirname, 'setup-template.ps1');
  if (fs.existsSync(setupTemplate)) {
    fs.copyFileSync(setupTemplate, path.join(installerPayloadDir, 'setup.ps1'));
  }
  const setupCmdContent = `@echo off\r\npowershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0setup.ps1" %*\r\n`;
  fs.writeFileSync(path.join(installerPayloadDir, 'setup.cmd'), setupCmdContent, 'utf-8');

  const installerExePath = path.join(packagesDir, config.installerName);
  if (fs.existsSync(installerExePath)) {
    fs.unlinkSync(installerExePath);
  }

  if (fs.existsSync(sfxPath)) {
    const brandedSfxPath = path.join(packagesDir, 'installer-stub.sfx');
    try {
      // Brand the stub before appending the archive to preserve the SFX payload.
      fs.copyFileSync(sfxPath, brandedSfxPath);
      setExecutableIcon(brandedSfxPath, applicationIcon);
      execSync(`7z a -sfx"${brandedSfxPath}" "${installerExePath}" "${installerPayloadDir}/*"`, { stdio: 'pipe' });
      logMessage(`Self-extracting Windows installer created: ${installerExePath} (${(fs.statSync(installerExePath).size / (1024 * 1024)).toFixed(1)} MB)`, logFile);
    } catch (sfxErr) {
      logMessage(`ERROR: 7z SFX creation failed: ${sfxErr.message || sfxErr}`, logFile);
      throw sfxErr;
    } finally {
      fs.rmSync(brandedSfxPath, { force: true });
    }
  }

  // Clean staging directories
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  if (fs.existsSync(installerPayloadDir)) fs.rmSync(installerPayloadDir, { recursive: true, force: true });

  // 8. Code Signing Hook
  const certPath = process.env.SIGNING_CERT_PATH || process.env.PFX_PATH;
  const certPass = process.env.SIGNING_CERT_PASSWORD || process.env.PFX_PASSWORD;
  const signtoolExe = process.env.SIGNTOOL_PATH || 'C:\\Program Files (x86)\\Windows Kits\\10\\bin\\10.0.26100.0\\x64\\signtool.exe';

  if (certPath && fs.existsSync(certPath) && fs.existsSync(signtoolExe)) {
    logMessage(`[SIGNING] Signing certificate found at ${certPath}. Invoking signtool...`, logFile);
    const passArg = certPass ? `/p "${certPass}"` : '';
    const signTargets = [
      path.join(portableDir, config.executableName),
      fs.existsSync(installerExePath) ? installerExePath : null,
    ].filter(Boolean);

    for (const target of signTargets) {
      try {
        execSync(`"${signtoolExe}" sign /f "${certPath}" ${passArg} /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 "${target}"`, { stdio: 'pipe' });
        logMessage(`[SIGNING] Successfully signed: ${target}`, logFile);
      } catch (signErr) {
        logMessage(`[SIGNING] Failed to sign ${target}: ${signErr.message || signErr}`, logFile);
      }
    }
  } else {
    logMessage('[SIGNING] No signing certificate supplied (SIGNING_CERT_PATH not configured). Binaries remain unsigned.', logFile);
    logMessage('[SIGNING] Note: Unsigned binaries may trigger Windows Defender heuristic warnings (WH_KEYBOARD_LL / SendInput false positive). Checksums are generated for release verification.', logFile);
  }

  // 9. Generate Checksums
  logMessage('Generating SHA-256 integrity checksums for all release packages...', logFile);
  const checksumFiles = [
    { label: 'Installer (x64)', path: installerExePath },
    { label: 'Portable ZIP (x64)', path: portableZipPath },
    { label: 'Portable Main Executable', path: path.join(portableDir, config.executableName) },
    { label: 'Application ASAR Archive', path: path.join(portableDir, 'resources/app.asar') },
    { label: 'Rust Native Addon (.node)', path: path.join(portableDir, 'resources/app.asar.unpacked/macro_recorder_native.node') },
    { label: 'HidHide Driver Setup', path: path.join(portableDir, 'resources/drivers/HidHide_1.5.230_x64.exe') },
    { label: 'ViGEmBus Driver Setup', path: path.join(portableDir, 'resources/drivers/ViGEmBus_1.22.0_x64_x86_arm64.exe') },
  ];

  const checksums = [];
  const sumsTextLines = [];

  for (const item of checksumFiles) {
    if (fs.existsSync(item.path)) {
      const hash = calculateSha256(item.path);
      const stat = fs.statSync(item.path);
      const relName = path.relative(packagesDir, item.path).replace(/\\/g, '/');
      checksums.push({
        label: item.label,
        relativeFile: relName,
        sizeBytes: stat.size,
        sha256: hash,
      });
      sumsTextLines.push(`${hash} *${relName}`);
      logMessage(`  ${hash}  ${relName} (${(stat.size / 1024).toFixed(1)} KB)`, logFile);
    }
  }

  const sumsFilePath = path.join(packagesDir, 'SHA256SUMS.txt');
  fs.writeFileSync(sumsFilePath, sumsTextLines.join('\n') + '\n', 'utf-8');

  const sumsJsonPath = path.join(packagesDir, 'checksums.json');
  fs.writeFileSync(sumsJsonPath, JSON.stringify(checksums, null, 2), 'utf-8');

  // 10. Audit Budgets and Packaging Rules
  logMessage('Auditing package size budgets and exclusion rules...', logFile);
  const portableSize = getDirectorySize(portableDir);
  const nativeStat = fs.statSync(nativeAddonPath);
  const installerSize = fs.existsSync(installerExePath) ? fs.statSync(installerExePath).size : 0;

  const maxPortableBytes = config.budgets.maxInstalledSizeMb * 1024 * 1024;
  const maxInstallerBytes = config.budgets.maxInstallerSizeMb * 1024 * 1024;
  const maxNativeBytes = config.budgets.maxNativeAddonSizeMb * 1024 * 1024;

  const audit = {
    portableSizeBytes: portableSize,
    portableSizeMb: (portableSize / (1024 * 1024)).toFixed(2),
    portableBudgetMb: config.budgets.maxInstalledSizeMb,
    portablePass: portableSize <= maxPortableBytes,

    installerSizeBytes: installerSize,
    installerSizeMb: (installerSize / (1024 * 1024)).toFixed(2),
    installerBudgetMb: config.budgets.maxInstallerSizeMb,
    installerPass: installerSize <= maxInstallerBytes,

    nativeSizeBytes: nativeStat.size,
    nativeSizeMb: (nativeStat.size / (1024 * 1024)).toFixed(2),
    nativeBudgetMb: config.budgets.maxNativeAddonSizeMb,
    nativePass: nativeStat.size <= maxNativeBytes,
  };

  logMessage(`Budget Audit: Portable size: ${audit.portableSizeMb} MB / ${audit.portableBudgetMb} MB -> ${audit.portablePass ? 'PASS' : 'FAIL'}`, logFile);
  if (installerSize > 0) {
    logMessage(`Budget Audit: Installer size: ${audit.installerSizeMb} MB / ${audit.installerBudgetMb} MB -> ${audit.installerPass ? 'PASS' : 'FAIL'}`, logFile);
  }
  logMessage(`Budget Audit: Native Addon size: ${audit.nativeSizeMb} MB / ${audit.nativeBudgetMb} MB -> ${audit.nativePass ? 'PASS' : 'FAIL'}`, logFile);

  const durationMs = Date.now() - startTime;
  logMessage(`=== Macro Recorder Production Packaging Completed in ${(durationMs / 1000).toFixed(2)}s ===`, logFile);

  return {
    success: true,
    portableDir,
    portableZipPath,
    installerExePath,
    checksumsFile: sumsFilePath,
    audit,
  };
}

/** Refuses to replace a build that is running, which would fail halfway. */
async function packageProduction(options = {}) {
  const wsRoot = path.resolve(options.workspaceRoot || path.join(__dirname, '..'));
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-config.json'), 'utf-8'));
  const portableExe = path.join(wsRoot, 'artifacts', 'packages', config.portableDirName, config.executableName);
  if (fs.existsSync(portableExe)) {
    try {
      fs.closeSync(fs.openSync(portableExe, 'r+'));
    } catch {
      throw new Error(`Close the running app first: ${portableExe}`);
    }
  }
  return assemblePackages(options);
}

if (require.main === module) {
  packageProduction()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Packaging failed:', err);
      process.exit(1);
    });
}

module.exports = { packageProduction };
