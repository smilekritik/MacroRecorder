//! System and process RAM usage telemetry.
//!
//! Covers:
//! - Queries system memory load and total/available physical RAM via `GlobalMemoryStatusEx`
//! - Measures current process working set and private committed bytes via `GetProcessMemoryInfo`

use napi_derive::napi;
use windows::Win32::Foundation::{BOOL, HANDLE, HMODULE};
use windows::Win32::System::Threading::GetCurrentProcess;

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut std::ffi::c_void;
}

use crate::error::NativeResult;

#[repr(C)]
struct MemoryStatusEx {
    dw_length: u32,
    dw_memory_load: u32,
    ull_total_phys: u64,
    ull_avail_phys: u64,
    ull_total_page_file: u64,
    ull_avail_page_file: u64,
    ull_total_virtual: u64,
    ull_avail_virtual: u64,
    ull_avail_extended_virtual: u64,
}

#[repr(C)]
struct ProcessMemoryCountersEx {
    cb: u32,
    page_fault_count: u32,
    peak_working_set_size: usize,
    working_set_size: usize,
    quota_peak_paged_pool_usage: usize,
    quota_paged_pool_usage: usize,
    quota_peak_non_paged_pool_usage: usize,
    quota_non_paged_pool_usage: usize,
    pagefile_usage: usize,
    peak_pagefile_usage: usize,
    private_usage: usize,
}

#[allow(non_snake_case)]
extern "system" {
    fn GlobalMemoryStatusEx(lpBuffer: *mut MemoryStatusEx) -> BOOL;
}

#[allow(non_snake_case)]
type FnGetProcessMemoryInfo = unsafe extern "system" fn(
    hProcess: HANDLE,
    ppsmc: *mut ProcessMemoryCountersEx,
    cb: u32,
) -> BOOL;

/// Dynamically resolves `GetProcessMemoryInfo` from `kernel32.dll` (Win 7+) or `psapi.dll`.
fn resolve_get_process_memory_info() -> Option<FnGetProcessMemoryInfo> {
    let dll_name: Vec<u16> = "kernel32.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if !module.is_invalid() && !module.0.is_null() {
        if let Ok(proc_name) = std::ffi::CString::new("K32GetProcessMemoryInfo") {
            let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
            if !proc.is_null() {
                return Some(unsafe { std::mem::transmute(proc) });
            }
        }
    }

    let psapi_name: Vec<u16> = "psapi.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(psapi_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }
    let proc_name = std::ffi::CString::new("GetProcessMemoryInfo").ok()?;
    let proc = unsafe { GetProcAddress(module, proc_name.as_ptr() as *const u8) };
    if proc.is_null() {
        return None;
    }
    Some(unsafe { std::mem::transmute(proc) })
}

/// Telemetry metrics for system RAM and application process memory.
#[napi(object)]
#[derive(Debug, Clone, PartialEq)]
pub struct RamMetrics {
    pub system_memory_percent: f64,
    pub total_system_memory_mb: f64,
    pub available_system_memory_mb: f64,
    pub process_working_set_mb: f64,
    pub process_private_memory_mb: f64,
}

/// Samples current system memory load and process memory working set.
pub fn sample_memory_status() -> NativeResult<RamMetrics> {
    let mut mem_status = MemoryStatusEx {
        dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
        dw_memory_load: 0,
        ull_total_phys: 0,
        ull_avail_phys: 0,
        ull_total_page_file: 0,
        ull_avail_page_file: 0,
        ull_total_virtual: 0,
        ull_avail_virtual: 0,
        ull_avail_extended_virtual: 0,
    };

    let ok = unsafe { GlobalMemoryStatusEx(&mut mem_status) };
    let (system_memory_percent, total_sys_mb, avail_sys_mb) = if ok.as_bool() {
        (
            (mem_status.dw_memory_load as f64).clamp(0.0, 100.0),
            (mem_status.ull_total_phys as f64) / (1024.0 * 1024.0),
            (mem_status.ull_avail_phys as f64) / (1024.0 * 1024.0),
        )
    } else {
        (0.0, 0.0, 0.0)
    };

    let (process_working_set_mb, process_private_memory_mb) = if let Some(get_info) =
        resolve_get_process_memory_info()
    {
        let mut counters: ProcessMemoryCountersEx = unsafe { std::mem::zeroed() };
        counters.cb = std::mem::size_of::<ProcessMemoryCountersEx>() as u32;

        let cur_proc = unsafe { GetCurrentProcess() };
        let proc_ok = unsafe { get_info(cur_proc, &mut counters, counters.cb) };

        if proc_ok.as_bool() {
            (
                (counters.working_set_size as f64) / (1024.0 * 1024.0),
                (counters.private_usage as f64) / (1024.0 * 1024.0),
            )
        } else {
            (0.0, 0.0)
        }
    } else {
        (0.0, 0.0)
    };

    Ok(RamMetrics {
        system_memory_percent,
        total_system_memory_mb: total_sys_mb,
        available_system_memory_mb: avail_sys_mb,
        process_working_set_mb,
        process_private_memory_mb,
    })
}

/// Returns the current process working set in megabytes.
pub fn sample_process_memory() -> f64 {
    sample_memory_status()
        .map(|m| m.process_working_set_mb)
        .unwrap_or(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sample_memory_status_returns_positive_numbers() {
        let metrics = sample_memory_status().expect("sample_memory_status must succeed");
        assert!(metrics.system_memory_percent > 0.0 && metrics.system_memory_percent <= 100.0);
        assert!(metrics.total_system_memory_mb > 1024.0); // At least 1 GB RAM
        assert!(metrics.available_system_memory_mb > 0.0);
        assert!(metrics.process_working_set_mb > 0.0);
    }

    #[test]
    fn test_sample_process_memory() {
        let mb = sample_process_memory();
        assert!(mb > 0.0, "Process memory working set should be > 0 MB");
    }
}
