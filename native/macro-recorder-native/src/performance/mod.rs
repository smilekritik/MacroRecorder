//! CPU, discrete GPU, RAM performance monitoring, and graphics adapter telemetry.
//!
//! and `RuntimeLoadMonitor`.

pub mod cpu;
pub mod discrete_gpu;
pub mod gpu;
pub mod memory;
pub mod probe;

pub use cpu::{sample_cpu_utilization, CpuLoadProbe, SystemTimesMonitor};
pub use discrete_gpu::{
    enumerate_adapters, export_discrete_gpu_preference, find_strongest_adapter,
    find_strongest_adapter_luid_filter, AmdPowerXpressRequestHighPerformance, GpuAdapterInfo,
    NvOptimusEnablement,
};
pub use gpu::{sample_gpu_utilization, GpuLoadProbe};
pub use memory::{sample_memory_status, sample_process_memory, RamMetrics};
pub use probe::{PeakLoadTracker, SystemLoadProbe, SystemLoadSnapshot};
