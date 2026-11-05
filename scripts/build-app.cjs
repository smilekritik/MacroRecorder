/**
 * Production Bundler for Macro Recorder (CommonJS).
 * Compiles Rust cdylib, bundles Main, Preload, and Renderer with esbuild and tailwindcss.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const esbuild = require('esbuild');

function logMessage(msg, logFile) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${msg}`;
  console.log(line);
  if (logFile) {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, line + '\n', 'utf-8');
  }
}

async function buildProduction(config) {
  const startTime = Date.now();
  const { workspaceRoot, outDir, skipNative = false, clean = false, logFile } = config;

  logMessage('=== Starting Macro Recorder Production Build ===', logFile);
  logMessage(`Workspace: ${workspaceRoot}`, logFile);
  logMessage(`Output Directory: ${outDir}`, logFile);

  if (clean && fs.existsSync(outDir)) {
    logMessage('Cleaning previous build artifacts...', logFile);
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const artifactsDir = path.resolve(workspaceRoot, 'artifacts');
  const nativeTargetDir = path.join(artifactsDir, 'native', 'target');
  const nativeOutputDir = path.join(artifactsDir, 'native');
  const nativeNodePath = path.join(nativeOutputDir, 'macro_recorder_native.node');

  // Step 1: Compile Native Rust Addon (if not skipped)
  if (!skipNative) {
    logMessage('Building Rust N-API native addon in release mode...', logFile);
    const cargoManifest = path.join(workspaceRoot, 'native', 'macro-recorder-native', 'Cargo.toml');
    const cargoCmd = `cargo build --locked --release --manifest-path "${cargoManifest}" --target-dir "${nativeTargetDir}"`;
    try {
      execSync(cargoCmd, { stdio: 'inherit', cwd: workspaceRoot });
      const releaseDll = path.join(nativeTargetDir, 'release', 'macro_recorder_native.dll');
      if (fs.existsSync(releaseDll)) {
        fs.mkdirSync(nativeOutputDir, { recursive: true });
        fs.copyFileSync(releaseDll, nativeNodePath);
        const stat = fs.statSync(nativeNodePath);
        logMessage(`Native addon compiled successfully: ${nativeNodePath} (${(stat.size / 1024).toFixed(1)} KB)`, logFile);
      } else {
        throw new Error(`Expected native output not found at ${releaseDll}`);
      }
    } catch (err) {
      logMessage(`ERROR: Cargo build failed: ${err}`, logFile);
      throw err;
    }
  } else {
    logMessage('Skipping native build as requested.', logFile);
  }

  // Step 2: Bundle Preload Script
  logMessage('Bundling preload script...', logFile);
  const preloadOut = path.join(outDir, 'preload.cjs');
  await esbuild.build({
    entryPoints: [path.join(workspaceRoot, 'apps/desktop/src/preload/index.ts')],
    bundle: true,
    outfile: preloadOut,
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
  });
  logMessage(`Preload script bundled: ${preloadOut}`, logFile);

  // Step 3: Bundle Main Process Entry
  logMessage('Bundling main process...', logFile);
  const mainOut = path.join(outDir, 'main.cjs');
  const mainEntryPath = path.join(workspaceRoot, 'apps/desktop/src/main/index.ts');
  await esbuild.build({
    entryPoints: [mainEntryPath],
    bundle: true,
    outfile: mainOut,
    format: 'cjs',
    platform: 'node',
    external: ['electron'],
    minify: true,
    sourcemap: false,
    legalComments: 'none',
  });
  logMessage(`Main process bundled: ${mainOut}`, logFile);

  // Step 4: Compile Tailwind CSS and Theme styling
  logMessage('Compiling Tailwind CSS and Theme styling...', logFile);
  const themeCssPath = path.join(workspaceRoot, 'apps/desktop/src/renderer/design-system/theme.css');
  const themeCssContent = fs.readFileSync(themeCssPath, 'utf-8');

  const tailwindCli = path.join(workspaceRoot, 'apps/desktop/node_modules/tailwindcss/lib/cli.js');
  const tailwindOut = path.join(outDir, 'tailwind.css');
  const contentGlob = path.join(workspaceRoot, 'apps/desktop/src/renderer/**/*.{tsx,ts,jsx,js,html}').replace(/\\/g, '/');

  try {
    execSync(`node "${tailwindCli}" --content "${contentGlob}" --minify -o "${tailwindOut}"`, {
      stdio: 'pipe',
      cwd: workspaceRoot,
    });
  } catch (tailwindErr) {
    logMessage(`ERROR: Tailwind CLI build: ${tailwindErr.message || tailwindErr}`, logFile);
    throw tailwindErr;
  }

  const combinedCss = `${themeCssContent}\n${fs.existsSync(tailwindOut) ? fs.readFileSync(tailwindOut, 'utf-8') : ''}`;
  fs.writeFileSync(path.join(outDir, 'styles.css'), combinedCss, 'utf-8');

  // Step 5: Bundle React Renderer Application
  logMessage('Bundling React renderer application...', logFile);
  const rendererOut = path.join(outDir, 'renderer.js');

  const nodeShimPlugin = {
    name: 'node-builtins-shim',
    setup(build) {
      build.onResolve({ filter: /^(fs|path|node:fs|node:path)$/ }, (args) => {
        return { path: args.path, namespace: 'node-shim' };
      });
      build.onLoad({ filter: /.*/, namespace: 'node-shim' }, () => {
        return {
          contents: 'export default {}; export const join = (...args) => args.join("/"); export const resolve = (...args) => args.join("/");',
          loader: 'js',
        };
      });
    },
  };

  await esbuild.build({
    entryPoints: [path.join(workspaceRoot, 'apps/desktop/src/renderer/main.tsx')],
    bundle: true,
    outfile: rendererOut,
    format: 'esm',
    platform: 'browser',
    plugins: [nodeShimPlugin],
    alias: {
      'react': path.join(workspaceRoot, 'apps/desktop/node_modules/react'),
      'react-dom': path.join(workspaceRoot, 'apps/desktop/node_modules/react-dom'),
      'react/jsx-runtime': path.join(workspaceRoot, 'apps/desktop/node_modules/react/jsx-runtime'),
    },
    define: {
      'process.env.NODE_ENV': '"production"',
      'process.env': '{}',
      'process.argv': '[]',
      'process.platform': '"win32"',
      'process': '{"env":{"NODE_ENV":"production"},"argv":[],"platform":"win32"}',
      'global': 'window',
    },
    minify: true,
    sourcemap: false,
    legalComments: 'eof',
  });

  // Step 6: Generate Production HTML Shell
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'" />
    <title>Macro Recorder</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body class="text-gray-100 select-none overflow-hidden m-0 p-0 font-sans">
    <div id="root" class="h-screen w-screen overflow-hidden"></div>
    <script type="module" src="./renderer.js"></script>
  </body>
</html>`;
  fs.writeFileSync(path.join(outDir, 'index.html'), htmlContent, 'utf-8');

  // Step 7: Create Production package.json for ASAR Root
  const packageJsonContent = {
    name: 'macro-recorder',
    version: '1.0.0',
    main: 'main.cjs',
  };
  fs.writeFileSync(path.join(outDir, 'package.json'), JSON.stringify(packageJsonContent, null, 2), 'utf-8');

  // Copy app resources
  const resourcesDir = path.join(workspaceRoot, 'apps', 'desktop', 'resources');
  if (fs.existsSync(resourcesDir)) {
    const iconPng = path.join(resourcesDir, 'icon.png');
    if (fs.existsSync(iconPng)) fs.copyFileSync(iconPng, path.join(outDir, 'icon.png'));
    const iconIco = path.join(resourcesDir, 'icon.ico');
    if (fs.existsSync(iconIco)) fs.copyFileSync(iconIco, path.join(outDir, 'icon.ico'));
  }

  const durationMs = Date.now() - startTime;
  logMessage(`=== Production Build Succeeded in ${(durationMs / 1000).toFixed(2)}s ===`, logFile);

  return {
    success: true,
    bundleDir: outDir,
    nativePath: nativeNodePath,
    timeMs: durationMs,
  };
}

if (require.main === module) {
  const wsRoot = path.resolve(__dirname, '..');
  const targetOut = path.resolve(wsRoot, 'artifacts/desktop/bundle');
  const logPath = path.resolve(wsRoot, 'artifacts/build.log');
  const skipNative = process.argv.includes('--skip-native');
  const clean = process.argv.includes('--clean');

  buildProduction({
    workspaceRoot: wsRoot,
    outDir: targetOut,
    skipNative,
    clean,
    logFile: logPath,
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Build failed:', err);
      process.exit(1);
    });
}

module.exports = { buildProduction };
