/**
 * @macro-recorder/domain/diagnostics
 *
 * Timing statistics, percentiles, dispatch receipts, microsecond/millisecond projections,
 * hook confirmation, runtime resource peaks, run history aggregation, and privacy classifications.
 */

// Types & Contracts
export * from './types.js';

// Time Projections & Millisecond Conversions
export * from './projections.js';

// Dispatch Receipt & Model
export * from './dispatch-receipt.js';

// Timing Statistics & Linear Percentiles
export * from './timing-statistics.js';

// Runtime Resource Peaks & Load Monitor
export * from './resource-peaks.js';

// Run History Aggregation & Summary Formatting
export * from './run-history.js';

// Privacy Classifications & Diagnostic Bundle Safety
export * from './privacy.js';

// Legacy class constructor aliases
export { DispatchReceiptModel as DispatchReceiptRecord } from './dispatch-receipt.js';
export { ResourcePeakModel as LoadPeakRecord } from './resource-peaks.js';
export { RunHistoryEntryModel as RunHistoryEntryRecord } from './run-history.js';
