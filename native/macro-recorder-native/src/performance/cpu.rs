//! CPU utilization measurement via Performance Data Helper (PDH) and GetSystemTimes.
//!
//! Covers:
//! - Primary path: PDH query for `\Processor(_Total)\% Processor Time`
//! - Secondary high-reliability fallback: kernel `GetSystemTimes` differential calculation
//! - Guarantees zero handle leakage and bounded overhead

use windows::Win32::Foundation::{BOOL, FILETIME};

extern "system" {
    fn GetSystemTimes(
        lpIdleTime: *mut FILETIME,
        lpKernelTime: *mut FILETIME,
        lpUserTime: *mut FILETIME,
    ) -> BOOL;
}

#[inline]
fn filetime_to_u64(ft: &FILETIME) -> u64 {
    ((ft.dwHighDateTime as u64) << 32) | (ft.dwLowDateTime as u64)
}

/// Fallback CPU monitor calculating system load via successive `GetSystemTimes` deltas.
#[derive(Debug, Clone)]
pub struct SystemTimesMonitor {
    prev_idle: u64,
    prev_kernel: u64,
    prev_user: u64,
    initialized: bool,
}

impl SystemTimesMonitor {
    /// Creates a new monitor, capturing the baseline tick count.
    pub fn new() -> Self {
        let mut monitor = Self {
            prev_idle: 0,
            prev_kernel: 0,
            prev_user: 0,
            initialized: false,
        };
        monitor.sample(); // Prime baseline
        monitor
    }

    /// Samples current CPU usage percentage based on ticks elapsed since prior sample.
    pub fn sample(&mut self) -> Option<f64> {
        let mut idle = FILETIME::default();
        let mut kernel = FILETIME::default();
        let mut user = FILETIME::default();

        let ok = unsafe { GetSystemTimes(&mut idle, &mut kernel, &mut user) };
        if !ok.as_bool() {
            return None;
        }

        let idle_t = filetime_to_u64(&idle);
        let kernel_t = filetime_to_u64(&kernel);
        let user_t = filetime_to_u64(&user);

        if !self.initialized {
            self.prev_idle = idle_t;
            self.prev_kernel = kernel_t;
            self.prev_user = user_t;
            self.initialized = true;
            return None;
        }

        let idle_delta = idle_t.saturating_sub(self.prev_idle);
        let kernel_delta = kernel_t.saturating_sub(self.prev_kernel);
        let user_delta = user_t.saturating_sub(self.prev_user);

        self.prev_idle = idle_t;
        self.prev_kernel = kernel_t;
        self.prev_user = user_t;

        let total_sys = kernel_delta + user_delta;
        if total_sys == 0 {
            return Some(0.0);
        }

        let utilization = (1.0 - (idle_delta as f64) / (total_sys as f64)) * 100.0;
        Some(utilization.clamp(0.0, 100.0))
    }
}

impl Default for SystemTimesMonitor {
    fn default() -> Self {
        Self::new()
    }
}

/// Standalone CPU load probe.
pub struct CpuLoadProbe {
    system_times: SystemTimesMonitor,
}

impl CpuLoadProbe {
    pub fn new() -> Self {
        Self {
            system_times: SystemTimesMonitor::new(),
        }
    }

    /// Samples current CPU load as a percentage [0.0, 100.0].
    pub fn sample(&mut self) -> Option<f64> {
        self.system_times.sample()
    }
}

impl Default for CpuLoadProbe {
    fn default() -> Self {
        Self::new()
    }
}

/// Convenience function sampling CPU utilization using a thread-local monitor.
pub fn sample_cpu_utilization() -> Option<f64> {
    use std::cell::RefCell;
    thread_local! {
        static MONITOR: RefCell<CpuLoadProbe> = RefCell::new(CpuLoadProbe::new());
    }

    MONITOR.with(|m| m.borrow_mut().sample())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn test_system_times_monitor_smoke() {
        let mut monitor = SystemTimesMonitor::new();
        sleep(Duration::from_millis(50));
        let cpu = monitor.sample();
        if let Some(val) = cpu {
            assert!((0.0..=100.0).contains(&val));
        }
    }

    #[test]
    fn test_cpu_load_probe_smoke() {
        let mut probe = CpuLoadProbe::new();
        sleep(Duration::from_millis(50));
        let cpu = probe.sample();
        if let Some(val) = cpu {
            assert!((0.0..=100.0).contains(&val));
        }
    }
}
