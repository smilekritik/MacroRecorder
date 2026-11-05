//! Scan-code policy and virtual-key mapping for global SendInput and targeted delivery.
//!
//! Provides hardware-level scan code translation independent of the active keyboard layout,
//! adhering to distinct scan-code policies across global and targeted modes.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    MapVirtualKeyW, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_SCANCODE, MAPVK_VK_TO_VSC,
};

/// Resolves the scan code for a given virtual key.
///
/// If an explicit non-zero scan code is provided, it is returned directly.
/// Otherwise, `MapVirtualKeyW` translates the virtual key to its hardware scan code.
#[inline]
pub fn resolve_scan_code(virtual_key: u32, explicit_scan_code: u32) -> u32 {
    if explicit_scan_code != 0 {
        explicit_scan_code
    } else {
        unsafe { MapVirtualKeyW(virtual_key, MAPVK_VK_TO_VSC) }
    }
}

/// Computes SendInput flags and key/scan fields under the global scan-code policy.
///
/// Under `prefer_scan_codes = true`, if a scan code is available, `wVk` is set to 0
/// and `wScan` holds the hardware scan code with `KEYEVENTF_SCANCODE` active.
/// Otherwise, `wVk` holds the virtual key and `wScan` is 0.
#[inline]
pub fn compute_send_input_keyboard_params(
    virtual_key: u32,
    scan_code: u32,
    extended: bool,
    is_up: bool,
    prefer_scan_codes: bool,
) -> (u16, u16, u32) {
    let use_scan = prefer_scan_codes && scan_code != 0;
    let mut flags = 0u32;

    if is_up {
        flags |= KEYEVENTF_KEYUP.0;
    }
    if extended {
        flags |= KEYEVENTF_EXTENDEDKEY.0;
    }
    if use_scan {
        flags |= KEYEVENTF_SCANCODE.0;
    }

    let w_vk = if use_scan { 0u16 } else { virtual_key as u16 };
    let w_scan = if use_scan { scan_code as u16 } else { 0u16 };

    (w_vk, w_scan, flags)
}

/// Constructs the 32/64-bit `lParam` for `WM_KEYDOWN` and `WM_KEYUP` messages.
///
/// Layout:
/// - Bits 0–15: Repeat count (1)
/// - Bits 16–23: OEM scan code
/// - Bit 24: Extended key flag (1 if extended key such as right Alt/Ctrl or arrows)
/// - Bits 25–28: Reserved (0)
/// - Bit 29: Context code (0 for WM_KEYDOWN/UP)
/// - Bit 30: Previous key state (1 for key release)
/// - Bit 31: Transition state (1 for key release)
#[inline]
pub fn make_keyboard_lparam(
    virtual_key: u32,
    scan_code: u32,
    extended: bool,
    is_up: bool,
) -> isize {
    let scan = resolve_scan_code(virtual_key, scan_code);
    let mut l_param: i64 = 1 | (((scan as i64) & 0xFF) << 16);

    if extended {
        l_param |= 1 << 24;
    }
    if is_up {
        l_param |= (1 << 30) | (1 << 31);
    }

    l_param as isize
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_scan_code_prefers_explicit() {
        assert_eq!(resolve_scan_code(0x41, 0x1E), 0x1E);
    }

    #[test]
    fn test_resolve_scan_code_maps_vk_when_zero() {
        // VK_A is 0x41 -> US QWERTY scan code is 0x1E (30)
        let scan = resolve_scan_code(0x41, 0);
        assert_eq!(scan, 0x1E);
    }

    #[test]
    fn test_send_input_params_policy() {
        // prefer_scan_codes = true with non-zero scan
        let (vk, scan, flags) = compute_send_input_keyboard_params(0x41, 0x1E, false, false, true);
        assert_eq!(vk, 0);
        assert_eq!(scan, 0x1E);
        assert_ne!(flags & KEYEVENTF_SCANCODE.0, 0);

        // prefer_scan_codes = false
        let (vk, scan, flags) = compute_send_input_keyboard_params(0x41, 0x1E, false, false, false);
        assert_eq!(vk, 0x41);
        assert_eq!(scan, 0);
        assert_eq!(flags & KEYEVENTF_SCANCODE.0, 0);

        // key up and extended
        let (_, _, flags) = compute_send_input_keyboard_params(0x27, 0, true, true, false);
        assert_ne!(flags & KEYEVENTF_KEYUP.0, 0);
        assert_ne!(flags & KEYEVENTF_EXTENDEDKEY.0, 0);
    }

    #[test]
    fn test_make_keyboard_lparam() {
        // Key down
        let lp_down = make_keyboard_lparam(0x41, 0x1E, false, false);
        assert_eq!(lp_down & 0xFFFF, 1); // repeat count 1
        assert_eq!((lp_down >> 16) & 0xFF, 0x1E); // scan code
        assert_eq!((lp_down >> 24) & 1, 0); // extended
        assert_eq!((lp_down >> 30) & 1, 0); // prev state
        assert_eq!((lp_down >> 31) & 1, 0); // transition state

        // Key up + extended
        let lp_up = make_keyboard_lparam(0x41, 0x1E, true, true);
        assert_eq!((lp_up >> 24) & 1, 1); // extended
        assert_eq!((lp_up >> 30) & 1, 1); // prev state
        assert_eq!((lp_up >> 31) & 1, 1); // transition state
    }
}
