//! Scheduling boost for threads that hold macro deadlines.

use windows::core::w;
use windows::Win32::Foundation::HANDLE;
use windows::Win32::System::Threading::{
    AvRevertMmThreadCharacteristics, AvSetMmThreadCharacteristicsW, GetCurrentThread,
    SetThreadPriority, THREAD_PRIORITY_HIGHEST,
};

/// Raises the current thread for its lifetime; MMCSS is reverted on drop.
pub struct TimingCriticalScope {
    mmcss: Option<HANDLE>,
}

impl TimingCriticalScope {
    pub fn enter() -> Self {
        // Failing to boost costs accuracy, not correctness, so playback continues regardless.
        unsafe {
            let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);
        }
        let mut task_index = 0u32;
        let mmcss = unsafe { AvSetMmThreadCharacteristicsW(w!("Pro Audio"), &mut task_index) }.ok();
        Self { mmcss }
    }
}

impl Drop for TimingCriticalScope {
    fn drop(&mut self) {
        if let Some(handle) = self.mmcss.take() {
            unsafe {
                let _ = AvRevertMmThreadCharacteristics(handle);
            }
        }
    }
}
