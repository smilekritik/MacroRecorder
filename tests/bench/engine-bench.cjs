// Measures the native engine directly: 200 F24 press/release pairs, 10 ms apart.
// F24 is the only input sent, and no ordinary application reacts to it.
//
//   node tests/bench/engine-bench.cjs [--runs=5] [--block-js] [--cpu-load]
//
// --block-js  freezes the JavaScript event loop during each run, proving timing does not need it.
// --cpu-load  keeps every logical core busy from worker threads while the runs execute.
const path = require('node:path');
const os = require('node:os');
const { Worker } = require('node:worker_threads');

const addon = require(path.resolve(__dirname, '../../artifacts/native/macro_recorder_native.node'));
const option = (name, fallback) => {
  const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return found ? Number(found.split('=')[1]) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const runs = option('runs', 5);
const pairs = option('pairs', 200);

const events = [];
for (let i = 0; i < pairs; i++) {
  const time = 50_000 + i * 20_000;
  events.push({ id: `d${i}`, kind: 'KeyDown', timeMicroseconds: time, virtualKey: 0x87, scanCode: 0x76 });
  events.push({ id: `u${i}`, kind: 'KeyUp', timeMicroseconds: time + 10_000, virtualKey: 0x87, scanCode: 0x76 });
}
const plan = {
  macroId: 'bench',
  name: 'Bench',
  speed: 1,
  repeatCount: 1,
  repeatDelayMilliseconds: 0,
  randomizeTiming: false,
  jitterMilliseconds: 0,
  preferScanCodes: false,
  activationMode: 'Once',
  targetMode: 'ForegroundAtStart',
  focusLoss: 'Continue',
  targetProcess: '',
  targetTitle: '',
  durationMicroseconds: 0,
  isAutomatic: false,
  enabled: true,
  hotkeyVirtualKey: 0,
  hotkeyModifiers: 0,
  events,
};

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

function waitForFinish(state) {
  return new Promise((resolve) => {
    state.onFinished = resolve;
  });
}

function burnFor(milliseconds) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end);
}

(async () => {
  const state = { receipts: [], onFinished: null };
  addon.initializeNativeRuntime(() => {});
  addon.engineSetCallback((event) => {
    if (event.kind === 'receipts') state.receipts.push(...event.receipts);
    if (event.kind === 'finished') {
      if (event.error) console.error('finished with error:', event.error);
      setTimeout(() => state.onFinished?.(), 120);
    }
  });
  const errors = addon.engineLoadPlans([plan]);
  if (errors.length) throw new Error(errors.join('; '));

  const loaders = [];
  if (flag('cpu-load')) {
    for (let i = 0; i < os.cpus().length; i++) {
      loaders.push(new Worker('for(;;);', { eval: true }));
    }
  }

  for (let run = 1; run <= runs; run++) {
    state.receipts = [];
    const finished = waitForFinish(state);
    const begun = process.hrtime.bigint();
    addon.engineStart('bench', 'Bench');
    if (flag('block-js')) burnFor(3000);
    await finished;
    const wallMs = Number(process.hrtime.bigint() - begun) / 1e6;
    const jitters = state.receipts
      .map((r) => (r.startedMicroseconds - (r.plannedMicroseconds ?? r.scheduledMicroseconds)) / 1000)
      .sort((a, b) => a - b);
    const average = jitters.reduce((sum, value) => sum + value, 0) / jitters.length;
    const failed = state.receipts.filter((r) => !r.success).length;
    const confirmed = state.receipts.filter((r) => r.confirmedMicroseconds != null).length;
    console.log(
      `run ${run}: n=${jitters.length} avg=${average.toFixed(3)} p50=${quantile(jitters, 0.5).toFixed(3)} ` +
        `p95=${quantile(jitters, 0.95).toFixed(3)} p99=${quantile(jitters, 0.99).toFixed(3)} ` +
        `max=${jitters[jitters.length - 1].toFixed(3)} ms wall=${wallMs.toFixed(0)} failed=${failed} confirmed=${confirmed}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Stop latency: time from the call until the session has released and finished.
  const stopped = waitForFinish(state);
  addon.engineStart('bench', 'Bench');
  await new Promise((resolve) => setTimeout(resolve, 500));
  const stopBegun = process.hrtime.bigint();
  addon.engineStop();
  while (addon.engineGetStatus().length > 0);
  console.log(`stop latency: ${(Number(process.hrtime.bigint() - stopBegun) / 1000).toFixed(0)} us`);
  await stopped;

  await Promise.all(loaders.map((worker) => worker.terminate()));
  addon.shutdownNativeRuntime();
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
