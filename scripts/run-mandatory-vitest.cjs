const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const [suiteName, ...vitestArgs] = process.argv.slice(2);
if (!suiteName) {
  console.error('Usage: node scripts/run-mandatory-vitest.cjs <suite-name> [vitest arguments]');
  process.exit(2);
}

const workspaceRoot = path.resolve(__dirname, '..');
const vitestCli = path.join(workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs');
const reportPath = path.join(
  os.tmpdir(),
  `macro-recorder-${suiteName.replace(/[^a-z0-9_-]/gi, '-')}-${process.pid}.json`,
);

try {
  const result = spawnSync(
    process.execPath,
    [vitestCli, 'run', ...vitestArgs, '--reporter=json', `--outputFile=${reportPath}`],
    {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (!fs.existsSync(reportPath)) {
    throw new Error(
      `Vitest exited with code ${result.status ?? 1} without producing the mandatory JSON report at ${reportPath}`,
    );
  }

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const assertionResults = Array.isArray(report.testResults)
    ? report.testResults.flatMap((testFile) =>
        Array.isArray(testFile.assertionResults) ? testFile.assertionResults : [],
      )
    : [];
  if (result.status !== 0) {
    const details = Array.isArray(report.testResults)
      ? report.testResults.flatMap((testFile) => [
          testFile.message,
          ...(testFile.assertionResults || []).flatMap((assertion) => assertion.failureMessages || []),
        ]).filter(Boolean).join('; ')
      : '';
    throw new Error(
      `Mandatory ${suiteName} suite exited with code ${result.status ?? 1}` +
        (details ? `: ${details}` : ''),
    );
  }
  const totalTests = Number.isInteger(report.numTotalTests)
    ? report.numTotalTests
    : assertionResults.length;
  const skippedTests = Number.isInteger(report.numPendingTests)
    ? report.numPendingTests + (Number.isInteger(report.numTodoTests) ? report.numTodoTests : 0)
    : assertionResults.filter((testCase) =>
        ['pending', 'skipped', 'todo', 'disabled'].includes(String(testCase.status).toLowerCase()),
      ).length;

  if (totalTests <= 0) {
    throw new Error(`Mandatory ${suiteName} suite discovered zero tests`);
  }
  if (skippedTests > 0) {
    const skippedNames = assertionResults
      .filter((testCase) => ['pending', 'skipped', 'todo', 'disabled'].includes(String(testCase.status).toLowerCase()))
      .map((testCase) => testCase.fullName || testCase.title)
      .filter(Boolean);
    throw new Error(
      `Mandatory ${suiteName} suite skipped ${skippedTests} test(s)` +
        (skippedNames.length > 0 ? `: ${skippedNames.join('; ')}` : ''),
    );
  }
  if (report.success !== true) {
    throw new Error(`Mandatory ${suiteName} suite did not report success`);
  }

  console.log(`Mandatory ${suiteName} gate passed: ${totalTests} test(s), zero skipped.`);
} catch (error) {
  console.error(`MANDATORY SUITE GATE FAILED: ${error instanceof Error ? error.message : String(error)}`);
  if (fs.existsSync(reportPath)) {
    const savedReport = path.join(workspaceRoot, 'artifacts', 'test-reports', `${suiteName.replace(/[^a-z0-9_-]/gi, '-')}.json`);
    fs.mkdirSync(path.dirname(savedReport), { recursive: true });
    fs.copyFileSync(reportPath, savedReport);
    console.error(`Failure report saved to ${savedReport}`);
  }
  process.exitCode = 1;
} finally {
  fs.rmSync(reportPath, { force: true });
}
