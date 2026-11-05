//! Unified system load monitoring, peak tracking, and resource telemetry.
//!
//! Covers:
//! - Bounded-overhead coordinated sampling of CPU, GPU, and RAM
//! - Zero handle accumulation across indefinite monitoring runs
//! - Peak load combination and tracking for macro run diagnostics

use napi_derive::napi;

use crate::performance::cpu::CpuLoadProbe;
use crate::performance::gpu::GpuLoadProbe;
use crate::performance::memory::sample_memory_status;

/// Point-in-time snapshot of system and process resource utilization.
#[napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct SystemLoadSnapshot {
    pub cpu_percent: Option<f64>,
    pub gpu_percent: Option<f64>,
    pub memory_percent: f64,
    pub process_memory_mb: f64,
}

impl Default for SystemLoadSnapshot {
    fn default() -> Self {
        Self {
            cpu_percent: None,
            gpu_percent: None,
            memory_percent: 0.0,
            process_memory_mb: 0.0,
        }
    }
}

/// Coordinated probe sampling CPU, discrete GPU, and memory resources.
pub struct SystemLoadProbe {
    cpu_probe: CpuLoadProbe,
    gpu_probe: GpuLoadProbe,
}

impl SystemLoadProbe {
    /// Creates a new coordinated performance probe.
    pub fn new() -> Self {
        Self {
            cpu_probe: CpuLoadProbe::new(),
            gpu_probe: GpuLoadProbe::new(),
        }
    }

    /// Takes a coordinated sample of CPU, GPU, and RAM utilization.
    pub fn sample(&mut self) -> SystemLoadSnapshot {
        let cpu_percent = self.cpu_probe.sample();
        let gpu_percent = self.gpu_probe.sample();
        let ram = sample_memory_status().unwrap_or(crate::performance::memory::RamMetrics {
            system_memory_percent: 0.0,
            total_system_memory_mb: 0.0,
            available_system_memory_mb: 0.0,
            process_working_set_mb: 0.0,
            process_private_memory_mb: 0.0,
        });

        SystemLoadSnapshot {
            cpu_percent,
            gpu_percent,
            memory_percent: ram.system_memory_percent,
            process_memory_mb: ram.process_working_set_mb,
        }
    }
}

impl Default for SystemLoadProbe {
    fn default() -> Self {
        Self::new()
    }
}

/// Tracks peak resource utilization across a macro playback run.
///
#[derive(Debug, Clone, PartialEq)]
pub struct PeakLoadTracker {
    peak: SystemLoadSnapshot,
}

impl PeakLoadTracker {
    /// Creates a new peak tracker initialized to empty/zero load.
    pub fn new() -> Self {
        Self {
            peak: SystemLoadSnapshot::default(),
        }
    }

    /// Combines a new sample into the running peak statistics.
    pub fn update(&mut self, sample: &SystemLoadSnapshot) {
        self.peak.cpu_percent = match (self.peak.cpu_percent, sample.cpu_percent) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };

        self.peak.gpu_percent = match (self.peak.gpu_percent, sample.gpu_percent) {
            (Some(a), Some(b)) => Some(a.max(b)),
            (Some(a), None) => Some(a),
            (None, Some(b)) => Some(b),
            (None, None) => None,
        };

        self.peak.memory_percent = self.peak.memory_percent.max(sample.memory_percent);
        self.peak.process_memory_mb = self.peak.process_memory_mb.max(sample.process_memory_mb);
    }

    /// Returns the current peak snapshot.
    pub fn peak(&self) -> SystemLoadSnapshot {
        self.peak.clone()
    }

    /// Resets running peak statistics to zero.
    pub fn reset(&mut self) {
        self.peak = SystemLoadSnapshot::default();
    }
}

impl Default for PeakLoadTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_peak_load_tracker_combine() {
        let mut tracker = PeakLoadTracker::new();

        let s1 = SystemLoadSnapshot {
            cpu_percent: Some(25.0),
            gpu_percent: Some(10.0),
            memory_percent: 45.0,
            process_memory_mb: 80.0,
        };
        tracker.update(&s1);

        let s2 = SystemLoadSnapshot {
            cpu_percent: Some(40.0),
            gpu_percent: Some(5.0),
            memory_percent: 50.0,
            process_memory_mb: 75.0,
        };
        tracker.update(&s2);

        let peak = tracker.peak();
        assert_eq!(peak.cpu_percent, Some(40.0));
        assert_eq!(peak.gpu_percent, Some(10.0));
        assert_eq!(peak.memory_percent, 50.0);
        assert_eq!(peak.process_memory_mb, 80.0);
    }

    #[test]
    fn test_system_load_probe_smoke() {
        let mut probe = SystemLoadProbe::new();
        let sample = probe.sample();
        assert!(sample.memory_percent >= 0.0 && sample.memory_percent <= 100.0);
        assert!(sample.process_memory_mb >= 0.0);
    }
}
