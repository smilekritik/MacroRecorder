//! Dynamic XInput bindings and hardware polling for Xbox-compatible controllers.
//!
//! Dynamically loads `xinput1_4.dll` (Win8+), falling back to `xinput1_3.dll` or `xinput9_1_0.dll`.

use std::sync::OnceLock;
use windows::Win32::Foundation::HMODULE;

use crate::gamepad::types::GamepadSnapshot;

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut std::ffi::c_void;
}

const ERROR_SUCCESS: u32 = 0;

/// Raw XInput gamepad state matching Win32 `XINPUT_GAMEPAD`.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct XInputGamepad {
    pub buttons: u16,
    pub left_trigger: u8,
    pub right_trigger: u8,
    pub thumb_lx: i16,
    pub thumb_ly: i16,
    pub thumb_rx: i16,
    pub thumb_ry: i16,
}

/// Raw XInput state matching Win32 `XINPUT_STATE`.
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct XInputState {
    pub packet_number: u32,
    pub gamepad: XInputGamepad,
}

type FnXInputGetState = unsafe extern "system" fn(user_index: u32, state: *mut XInputState) -> u32;

struct XInputApi {
    get_state: FnXInputGetState,
}

static XINPUT_API: OnceLock<Option<XInputApi>> = OnceLock::new();

fn load_xinput() -> Option<XInputApi> {
    let dll_candidates = ["xinput1_4.dll\0", "xinput1_3.dll\0", "xinput9_1_0.dll\0"];
    for dll_str in &dll_candidates {
        let utf16: Vec<u16> = dll_str.encode_utf16().collect();
        let hmodule = unsafe { LoadLibraryW(utf16.as_ptr()) };
        if hmodule.is_invalid() || hmodule.0.is_null() {
            continue;
        }
        let proc_name = b"XInputGetState\0";
        let proc = unsafe { GetProcAddress(hmodule, proc_name.as_ptr()) };
        if !proc.is_null() {
            let get_state: FnXInputGetState = unsafe { std::mem::transmute(proc) };
            return Some(XInputApi { get_state });
        }
    }
    None
}

fn get_xinput() -> Option<&'static XInputApi> {
    XINPUT_API.get_or_init(load_xinput).as_ref()
}

/// Checks whether XInput is available on this system.
pub fn is_xinput_available() -> bool {
    get_xinput().is_some()
}

/// Polls an XInput controller slot (0..3). Returns Some(XInputState) if connected.
pub fn get_xinput_state(user_index: u32) -> Option<XInputState> {
    if user_index >= 4 {
        return None;
    }
    let api = get_xinput()?;
    let mut state = XInputState::default();
    let res = unsafe { (api.get_state)(user_index, &mut state) };
    if res == ERROR_SUCCESS {
        Some(state)
    } else {
        None
    }
}

/// Reads an XInput slot into a `GamepadSnapshot`. Returns default/disconnected if not found.
pub fn read_xinput_snapshot(user_index: u32) -> Option<GamepadSnapshot> {
    let state = get_xinput_state(user_index)?;
    let pad = state.gamepad;
    Some(GamepadSnapshot {
        connected: true,
        buttons: pad.buttons,
        left_x: pad.thumb_lx,
        left_y: pad.thumb_ly,
        right_x: pad.thumb_rx,
        right_y: pad.thumb_ry,
        left_trigger: pad.left_trigger,
        right_trigger: pad.right_trigger,
    })
}

/// Returns the index of the first connected XInput controller (0..3), or None.
pub fn first_connected_xinput() -> Option<u32> {
    for slot in 0..4 {
        if get_xinput_state(slot).is_some() {
            return Some(slot);
        }
    }
    None
}

/// Returns true if any XInput controller (slots 0..3) is connected.
pub fn any_xinput_connected() -> bool {
    first_connected_xinput().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_xinput_availability_check() {
        // On modern Windows 10/11 x64, xinput1_4.dll is always present.
        let available = is_xinput_available();
        assert!(available, "XInput should be available on Windows");
    }

    #[test]
    fn test_invalid_slot_out_of_range() {
        assert!(get_xinput_state(4).is_none());
        assert!(get_xinput_state(10).is_none());
        assert!(read_xinput_snapshot(99).is_none());
    }
}
