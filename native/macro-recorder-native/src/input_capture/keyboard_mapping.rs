//! Layout-independent virtual key to hardware scan code mapping.

use windows::Win32::UI::Input::KeyboardAndMouse::{
    GetKeyNameTextW, MapVirtualKeyW, MAPVK_VK_TO_VSC, MAPVK_VK_TO_VSC_EX,
};

/// Hardware scan code and extended key flag for a virtual key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct KeyScanInfo {
    pub scan_code: u32,
    pub extended: bool,
}

pub struct KeyboardMapping;

impl KeyboardMapping {
    /// Maps a Windows Virtual Key code to its hardware scan code and extended flag.
    ///
    /// Evaluates `MAPVK_VK_TO_VSC_EX` first (preserving extended prefixes 0xE0 / 0xE1),
    /// falling back to `MAPVK_VK_TO_VSC` if unmapped.
    /// Explicitly identifies extended navigational, editing, and system keys.
    pub fn from_virtual_key(virtual_key: u32) -> KeyScanInfo {
        let mut mapped = unsafe { MapVirtualKeyW(virtual_key, MAPVK_VK_TO_VSC_EX) };
        if mapped == 0 {
            mapped = unsafe { MapVirtualKeyW(virtual_key, MAPVK_VK_TO_VSC) };
        }

        // Extended flag is set if the scan code has 0xE000 or 0xE100 prefix, or if
        // the virtual key belongs to the extended navigation/editing cluster:
        // PageUp (0x21), PageDown (0x22), End (0x23), Home (0x24),
        // Left (0x25), Up (0x26), Right (0x27), Down (0x28),
        // Insert (0x2D), Delete (0x2E), LWin (0x5B), RWin (0x5C),
        // Numpad Divide (0x6F), RControl (0xA3), RMenu/RAlt (0xA5).
        let extended = (mapped & 0xFF00) == 0xE000
            || (mapped & 0xFF00) == 0xE100
            || matches!(
                virtual_key,
                0x21 | 0x22 | 0x23 | 0x24 | 0x25 | 0x26 | 0x27 | 0x28 | 0x2D | 0x2E
                    | 0x5B | 0x5C | 0x6F | 0xA3 | 0xA5
            );

        KeyScanInfo {
            scan_code: mapped & 0xFF,
            extended,
        }
    }

    /// Queries the localized human-readable name of a key from its scan code and extended flag
    /// via the Win32 `GetKeyNameTextW` API.
    pub fn name_from_scan_code(scan_code: u32, extended: bool) -> String {
        // Bit 24 of lParam specifies whether the key is an extended key.
        let l_param = (((scan_code & 0xFF) as i32) << 16) | if extended { 1 << 24 } else { 0 };
        let mut buffer = [0u16; 64];
        let len = unsafe { GetKeyNameTextW(l_param, &mut buffer) };
        if len > 0 {
            String::from_utf16_lossy(&buffer[..len as usize])
        } else {
            String::new()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// LEGACY-TEST-025 / NATIVE-INPUT-025: KeyboardMapping_MapsLayoutIndependentScanCodes
    #[test]
    fn test_keyboard_mapping_maps_layout_independent_scan_codes() {
        // Enter is the same on all layouts: scan code 0x1C, not extended.
        let enter = KeyboardMapping.from_virtual_key(0x0D);
        assert_eq!(enter.scan_code, 0x1C);
        assert!(!enter.extended);

        // Key name by scan code is localized by the system — must be non-empty.
        let name = KeyboardMapping.name_from_scan_code(0x1C, false);
        assert!(!name.is_empty());
    }

    /// LEGACY-TEST-030 / NATIVE-INPUT-030: KeyboardMapping_ProvidesScanCodesForManualActions
    #[test]
    fn test_keyboard_mapping_provides_scan_codes_for_manual_actions() {
        let letter = KeyboardMapping.from_virtual_key(0x41); // 'A'
        let arrow = KeyboardMapping.from_virtual_key(0x25);  // Left Arrow

        assert!(letter.scan_code > 0);
        assert!(arrow.scan_code > 0);
        assert!(arrow.extended);
    }
}
