//! HidHide device firewall configuration, self-whitelisting, and eligible HID game controller discovery.
//!
//! Hides physical HID game controllers during playback to avoid "double input",
//! while strictly ensuring keyboards and mice are never targeted.
//! Interacts with the driver via `\\.\HidHide` IOCTL control codes.

use std::ffi::c_void;
use std::ptr::null_mut;
use std::sync::Mutex;
use windows::Win32::Foundation::{BOOL, HANDLE, HMODULE, HWND};

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut c_void;
    fn CloseHandle(hObject: HANDLE) -> BOOL;
    fn CreateFileW(
        lpFileName: *const u16,
        dwDesiredAccess: u32,
        dwShareMode: u32,
        lpSecurityAttributes: *const c_void,
        dwCreationDisposition: u32,
        dwFlagsAndAttributes: u32,
        hTemplateFile: HANDLE,
    ) -> HANDLE;
    fn DeviceIoControl(
        hDevice: HANDLE,
        dwIoControlCode: u32,
        lpInBuffer: *const c_void,
        nInBufferSize: u32,
        lpOutBuffer: *mut c_void,
        nOutBufferSize: u32,
        lpBytesReturned: *mut u32,
        lpOverlapped: *mut c_void,
    ) -> BOOL;
}

// HidHide IOCTL control codes: CTL_CODE(32769, N, METHOD_BUFFERED, FILE_READ_DATA)
const IOCTL_GET_WHITELIST: u32 = 0x80016000;
const IOCTL_SET_WHITELIST: u32 = 0x80016004;
const IOCTL_GET_BLACKLIST: u32 = 0x80016008;
const IOCTL_SET_BLACKLIST: u32 = 0x8001600C;
const IOCTL_GET_ACTIVE: u32 = 0x80016010;
const IOCTL_SET_ACTIVE: u32 = 0x80016014;

const GENERIC_READ: u32 = 0x80000000;
const GENERIC_WRITE: u32 = 0x40000000;
const FILE_SHARE_READ: u32 = 1;
const FILE_SHARE_WRITE: u32 = 2;
const OPEN_EXISTING: u32 = 3;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct Guid {
    data1: u32,
    data2: u16,
    data3: u16,
    data4: [u8; 8],
}

// GUID_DEVINTERFACE_HID: {4D1E55B2-F16F-11CF-88CB-001111000030}
const GUID_DEVINTERFACE_HID: Guid = Guid {
    data1: 0x4D1E55B2,
    data2: 0xF16F,
    data3: 0x11CF,
    data4: [0x88, 0xCB, 0x00, 0x11, 0x11, 0x00, 0x00, 0x30],
};

const DIGCF_PRESENT: u32 = 0x00000002;
const DIGCF_DEVICEINTERFACE: u32 = 0x00000010;

#[repr(C)]
struct SpDeviceInterfaceData {
    cb_size: u32,
    interface_class_guid: Guid,
    flags: u32,
    reserved: usize,
}

#[repr(C)]
struct SpDevinfoData {
    cb_size: u32,
    class_guid: Guid,
    dev_inst: u32,
    reserved: usize,
}

#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
pub struct HidpCaps {
    pub usage: u16,
    pub usage_page: u16,
    pub input_report_byte_length: u16,
    pub output_report_byte_length: u16,
    pub feature_report_byte_length: u16,
    pub reserved: [u16; 17],
    pub number_link_collection_nodes: u16,
    pub number_input_button_caps: u16,
    pub number_input_value_caps: u16,
    pub number_input_data_indices: u16,
    pub number_output_button_caps: u16,
    pub number_output_value_caps: u16,
    pub number_output_data_indices: u16,
    pub number_feature_button_caps: u16,
    pub number_feature_value_caps: u16,
    pub number_feature_data_indices: u16,
}

const HIDP_STATUS_SUCCESS: i32 = 0x00110000;

type HDEVINFO = *mut c_void;
type FnSetupDiGetClassDevsW = unsafe extern "system" fn(
    *const Guid,
    *const u16,
    HWND,
    u32,
) -> HDEVINFO;
type FnSetupDiEnumDeviceInterfaces = unsafe extern "system" fn(
    HDEVINFO,
    *const c_void,
    *const Guid,
    u32,
    *mut SpDeviceInterfaceData,
) -> BOOL;
type FnSetupDiGetDeviceInterfaceDetailW = unsafe extern "system" fn(
    HDEVINFO,
    *const SpDeviceInterfaceData,
    *mut u8,
    u32,
    *mut u32,
    *mut SpDevinfoData,
) -> BOOL;
type FnSetupDiGetDeviceInstanceIdW = unsafe extern "system" fn(
    HDEVINFO,
    *const SpDevinfoData,
    *mut u16,
    u32,
    *mut u32,
) -> BOOL;
type FnSetupDiDestroyDeviceInfoList = unsafe extern "system" fn(HDEVINFO) -> BOOL;

type FnHidDGetPreparsedData = unsafe extern "system" fn(HANDLE, *mut *mut c_void) -> BOOL;
type FnHidDFreePreparsedData = unsafe extern "system" fn(*mut c_void) -> BOOL;
type FnHidPGetCaps = unsafe extern "system" fn(*mut c_void, *mut HidpCaps) -> i32;

struct HidApis {
    get_class_devs: FnSetupDiGetClassDevsW,
    enum_interfaces: FnSetupDiEnumDeviceInterfaces,
    get_interface_detail: FnSetupDiGetDeviceInterfaceDetailW,
    get_instance_id: FnSetupDiGetDeviceInstanceIdW,
    destroy_info_list: FnSetupDiDestroyDeviceInfoList,
    get_preparsed: FnHidDGetPreparsedData,
    free_preparsed: FnHidDFreePreparsedData,
    get_caps: FnHidPGetCaps,
}

fn load_hid_apis() -> Option<HidApis> {
    let setupapi_dll: Vec<u16> = "setupapi.dll\0".encode_utf16().collect();
    let setupapi = unsafe { LoadLibraryW(setupapi_dll.as_ptr()) };
    if setupapi.is_invalid() || setupapi.0.is_null() {
        return None;
    }

    let hid_dll: Vec<u16> = "hid.dll\0".encode_utf16().collect();
    let hid = unsafe { LoadLibraryW(hid_dll.as_ptr()) };
    if hid.is_invalid() || hid.0.is_null() {
        return None;
    }

    let resolve = |h: HMODULE, name: &[u8]| -> *mut c_void {
        unsafe { GetProcAddress(h, name.as_ptr()) }
    };

    let p_gcd = resolve(setupapi, b"SetupDiGetClassDevsW\0");
    let p_edi = resolve(setupapi, b"SetupDiEnumDeviceInterfaces\0");
    let p_gid = resolve(setupapi, b"SetupDiGetDeviceInterfaceDetailW\0");
    let p_ginst = resolve(setupapi, b"SetupDiGetDeviceInstanceIdW\0");
    let p_ddil = resolve(setupapi, b"SetupDiDestroyDeviceInfoList\0");

    let p_gpd = resolve(hid, b"HidD_GetPreparsedData\0");
    let p_fpd = resolve(hid, b"HidD_FreePreparsedData\0");
    let p_gc = resolve(hid, b"HidP_GetCaps\0");

    if p_gcd.is_null()
        || p_edi.is_null()
        || p_gid.is_null()
        || p_ginst.is_null()
        || p_ddil.is_null()
        || p_gpd.is_null()
        || p_fpd.is_null()
        || p_gc.is_null()
    {
        return None;
    }

    Some(HidApis {
        get_class_devs: unsafe { std::mem::transmute(p_gcd) },
        enum_interfaces: unsafe { std::mem::transmute(p_edi) },
        get_interface_detail: unsafe { std::mem::transmute(p_gid) },
        get_instance_id: unsafe { std::mem::transmute(p_ginst) },
        destroy_info_list: unsafe { std::mem::transmute(p_ddil) },
        get_preparsed: unsafe { std::mem::transmute(p_gpd) },
        free_preparsed: unsafe { std::mem::transmute(p_fpd) },
        get_caps: unsafe { std::mem::transmute(p_gc) },
    })
}

/// Serializes a list of strings into a Windows MULTI_SZ double-null terminated buffer.
pub fn strings_to_multi_sz(strings: &[String]) -> Vec<u8> {
    let mut utf16: Vec<u16> = Vec::new();
    for s in strings {
        utf16.extend(s.encode_utf16());
        utf16.push(0);
    }
    utf16.push(0); // Final terminating null

    let byte_len = utf16.len() * 2;
    let mut bytes = vec![0u8; byte_len];
    unsafe {
        std::ptr::copy_nonoverlapping(
            utf16.as_ptr() as *const u8,
            bytes.as_mut_ptr(),
            byte_len,
        );
    }
    bytes
}

/// Deserializes a Windows MULTI_SZ double-null terminated buffer into a list of strings.
pub fn multi_sz_to_strings(buffer: &[u8]) -> Vec<String> {
    if buffer.len() < 2 {
        return Vec::new();
    }
    let u16_len = buffer.len() / 2;
    let slice = unsafe { std::slice::from_raw_parts(buffer.as_ptr() as *const u16, u16_len) };

    let mut result = Vec::new();
    let mut current = Vec::new();

    for &word in slice {
        if word == 0 {
            if !current.is_empty() {
                result.push(String::from_utf16_lossy(&current));
                current.clear();
            }
        } else {
            current.push(word);
        }
    }

    result
}

struct HidHideState {
    hidden_by_us: Vec<String>,
    we_activated: bool,
    self_whitelisted: bool,
}

static HIDHIDE_STATE: Mutex<HidHideState> = Mutex::new(HidHideState {
    hidden_by_us: Vec::new(),
    we_activated: false,
    self_whitelisted: false,
});

/// Safe handle to `\\.\HidHide`.
struct HidHideHandle(HANDLE);

impl HidHideHandle {
    fn open() -> Option<Self> {
        let path: Vec<u16> = "\\\\.\\HidHide\0".encode_utf16().collect();
        let handle = unsafe {
            CreateFileW(
                path.as_ptr(),
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                null_mut(),
                OPEN_EXISTING,
                0,
                HANDLE::default(),
            )
        };
        if handle.is_invalid() || handle.0.is_null() {
            None
        } else {
            Some(Self(handle))
        }
    }

    fn get_multi_sz(&self, ioctl: u32) -> Vec<String> {
        let mut bytes_returned = 0u32;
        // Probe size
        unsafe {
            let _ = DeviceIoControl(
                self.0,
                ioctl,
                null_mut(),
                0,
                null_mut(),
                0,
                &mut bytes_returned,
                null_mut(),
            );
        };

        if bytes_returned == 0 {
            bytes_returned = 4096; // Generous fallback buffer
        }

        let mut buffer = vec![0u8; bytes_returned as usize];
        let mut actual = 0u32;
        let success = unsafe {
            DeviceIoControl(
                self.0,
                ioctl,
                null_mut(),
                0,
                buffer.as_mut_ptr() as *mut c_void,
                buffer.len() as u32,
                &mut actual,
                null_mut(),
            )
        };

        if success.as_bool() && actual > 0 {
            multi_sz_to_strings(&buffer[..actual as usize])
        } else {
            Vec::new()
        }
    }

    fn set_multi_sz(&self, ioctl: u32, strings: &[String]) -> bool {
        let payload = strings_to_multi_sz(strings);
        let mut bytes_returned = 0u32;
        let success = unsafe {
            DeviceIoControl(
                self.0,
                ioctl,
                payload.as_ptr() as *const c_void,
                payload.len() as u32,
                null_mut(),
                0,
                &mut bytes_returned,
                null_mut(),
            )
        };
        success.as_bool()
    }

    fn get_active(&self) -> bool {
        let mut active: u8 = 0;
        let mut bytes_returned = 0u32;
        let success = unsafe {
            DeviceIoControl(
                self.0,
                IOCTL_GET_ACTIVE,
                null_mut(),
                0,
                &mut active as *mut u8 as *mut c_void,
                1,
                &mut bytes_returned,
                null_mut(),
            )
        };
        success.as_bool() && active != 0
    }

    fn set_active(&self, active: bool) -> bool {
        let mut flag: u8 = if active { 1 } else { 0 };
        let mut bytes_returned = 0u32;
        let success = unsafe {
            DeviceIoControl(
                self.0,
                IOCTL_SET_ACTIVE,
                &mut flag as *mut u8 as *const c_void,
                1,
                null_mut(),
                0,
                &mut bytes_returned,
                null_mut(),
            )
        };
        success.as_bool()
    }
}

impl Drop for HidHideHandle {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.0);
        }
    }
}

/// Checks whether a specific HID device is an eligible game controller (joystick/gamepad).
/// Strictly verifies `UsagePage == 0x01` (Generic Desktop) and `Usage == 0x04` (Joystick)
/// or `0x05` (Gamepad). Keyboards (0x06) and Mice (0x02) are NEVER matched.
pub fn is_eligible_game_controller(caps: &HidpCaps) -> bool {
    caps.usage_page == 0x01 && (caps.usage == 0x04 || caps.usage == 0x05)
}

/// Enumerates the Device Instance IDs of all physical HID game controllers currently connected.
pub fn enumerate_game_controller_instance_ids() -> Vec<String> {
    let apis = match load_hid_apis() {
        Some(a) => a,
        None => return Vec::new(),
    };

    let dev_info = unsafe {
        (apis.get_class_devs)(
            &GUID_DEVINTERFACE_HID,
            null_mut(),
            HWND::default(),
            DIGCF_PRESENT | DIGCF_DEVICEINTERFACE,
        )
    };

    if dev_info.is_null() {
        return Vec::new();
    }

    let mut result = Vec::new();
    let mut index = 0u32;

    loop {
        let mut if_data = SpDeviceInterfaceData {
            cb_size: std::mem::size_of::<SpDeviceInterfaceData>() as u32,
            interface_class_guid: Guid { data1: 0, data2: 0, data3: 0, data4: [0; 8] },
            flags: 0,
            reserved: 0,
        };

        let ok = unsafe {
            (apis.enum_interfaces)(
                dev_info,
                null_mut(),
                &GUID_DEVINTERFACE_HID,
                index,
                &mut if_data,
            )
        };

        if !ok.as_bool() {
            break;
        }
        index += 1;

        // Determine required buffer size for interface detail
        let mut req_size = 0u32;
        let mut dev_info_data = SpDevinfoData {
            cb_size: std::mem::size_of::<SpDevinfoData>() as u32,
            class_guid: Guid { data1: 0, data2: 0, data3: 0, data4: [0; 8] },
            dev_inst: 0,
            reserved: 0,
        };

        unsafe {
            let _ = (apis.get_interface_detail)(
                dev_info,
                &if_data,
                null_mut(),
                0,
                &mut req_size,
                &mut dev_info_data,
            );
        };

        if req_size == 0 {
            continue;
        }

        let mut detail_buffer = vec![0u8; req_size as usize];
        // On x64, cbSize is 8 bytes; on x86, cbSize is 5 or 6 bytes.
        let cb_size_val = if std::mem::size_of::<usize>() == 8 { 8u32 } else { 6u32 };
        unsafe {
            *(detail_buffer.as_mut_ptr() as *mut u32) = cb_size_val;
        }

        let ok_detail = unsafe {
            (apis.get_interface_detail)(
                dev_info,
                &if_data,
                detail_buffer.as_mut_ptr(),
                req_size,
                null_mut(),
                &mut dev_info_data,
            )
        };

        if !ok_detail.as_bool() {
            continue;
        }

        // The device path starts after cbSize in the detail data
        let device_path_offset = if std::mem::size_of::<usize>() == 8 { 4 } else { 4 };
        let device_path_ptr = unsafe {
            detail_buffer.as_ptr().add(device_path_offset) as *const u16
        };

        // Check if device is an eligible game controller
        let dev_handle = unsafe {
            CreateFileW(
                device_path_ptr,
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                null_mut(),
                OPEN_EXISTING,
                0,
                HANDLE::default(),
            )
        };

        if dev_handle.is_invalid() || dev_handle.0.is_null() {
            continue;
        }

        let mut preparsed: *mut c_void = null_mut();
        let ok_prep = unsafe { (apis.get_preparsed)(dev_handle, &mut preparsed) };
        if ok_prep.as_bool() && !preparsed.is_null() {
            let mut caps = HidpCaps::default();
            let status = unsafe { (apis.get_caps)(preparsed, &mut caps) };
            unsafe {
                let _ = (apis.free_preparsed)(preparsed);
                let _ = CloseHandle(dev_handle);
            }

            if status == HIDP_STATUS_SUCCESS && is_eligible_game_controller(&caps) {
                // Get device instance ID
                let mut inst_buf = vec![0u16; 512];
                let mut inst_req = 0u32;
                let ok_inst = unsafe {
                    (apis.get_instance_id)(
                        dev_info,
                        &dev_info_data,
                        inst_buf.as_mut_ptr(),
                        inst_buf.len() as u32,
                        &mut inst_req,
                    )
                };
                if ok_inst.as_bool() {
                    let len = inst_buf.iter().position(|&c| c == 0).unwrap_or(inst_buf.len());
                    let instance_id = String::from_utf16_lossy(&inst_buf[..len]);
                    if !instance_id.is_empty() && !result.contains(&instance_id) {
                        result.push(instance_id);
                    }
                }
            }
        } else {
            unsafe {
                let _ = CloseHandle(dev_handle);
            }
        }
    }

    unsafe {
        let _ = (apis.destroy_info_list)(dev_info);
    }

    result
}

/// High-level HidHide service controlling device concealment.
pub struct HidHideService;

impl HidHideService {
    /// Returns true if the HidHide driver is installed and usable.
    pub fn is_available() -> bool {
        HidHideHandle::open().is_some()
    }

    /// Whitelists the current process executable in HidHide so the application
    /// continues to receive real controller events for recording and tester UI.
    pub fn whitelist_self() {
        let mut state = HIDHIDE_STATE.lock().unwrap();
        if state.self_whitelisted {
            return;
        }

        let handle = match HidHideHandle::open() {
            Some(h) => h,
            None => return,
        };

        if let Ok(exe_path) = std::env::current_exe() {
            let exe_str = exe_path.to_string_lossy().to_string();
            let mut whitelist = handle.get_multi_sz(IOCTL_GET_WHITELIST);
            if !whitelist.iter().any(|p| p.eq_ignore_ascii_case(&exe_str)) {
                whitelist.push(exe_str);
                let _ = handle.set_multi_sz(IOCTL_SET_WHITELIST, &whitelist);
            }
            state.self_whitelisted = true;
        }
    }

    /// Hides all physical HID game controllers. Idempotent. Silently does nothing if driver is absent.
    pub fn activate() {
        let handle = match HidHideHandle::open() {
            Some(h) => h,
            None => return,
        };

        // Ensure self is whitelisted first
        Self::whitelist_self();
        let mut state = HIDHIDE_STATE.lock().unwrap();

        let mut blacklist = handle.get_multi_sz(IOCTL_GET_BLACKLIST);
        let eligible = enumerate_game_controller_instance_ids();

        let mut updated = false;
        for id in eligible {
            if state.hidden_by_us.iter().any(|h| h.eq_ignore_ascii_case(&id)) {
                continue;
            }
            if blacklist.iter().any(|b| b.eq_ignore_ascii_case(&id)) {
                continue;
            }
            blacklist.push(id.clone());
            state.hidden_by_us.push(id);
            updated = true;
        }

        if updated {
            let _ = handle.set_multi_sz(IOCTL_SET_BLACKLIST, &blacklist);
        }

        if !handle.get_active() {
            let _ = handle.set_active(true);
            state.we_activated = true;
        }
    }

    /// Restores device visibility: removes only our own blocks and restores active flag if we set it.
    pub fn deactivate() {
        let mut state = HIDHIDE_STATE.lock().unwrap();
        let handle = match HidHideHandle::open() {
            Some(h) => h,
            None => {
                state.hidden_by_us.clear();
                state.we_activated = false;
                return;
            }
        };

        if !state.hidden_by_us.is_empty() {
            let mut blacklist = handle.get_multi_sz(IOCTL_GET_BLACKLIST);
            blacklist.retain(|id| !state.hidden_by_us.iter().any(|h| h.eq_ignore_ascii_case(id)));
            let _ = handle.set_multi_sz(IOCTL_SET_BLACKLIST, &blacklist);
            state.hidden_by_us.clear();
        }

        if state.we_activated {
            let _ = handle.set_active(false);
            state.we_activated = false;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_multi_sz_serialization_round_trip() {
        let input = vec![
            "HID\\VID_054C&PID_09CC&MI_03\\7&...".to_string(),
            "C:\\Program Files\\MacroRecorder\\MacroRecorder.exe".to_string(),
        ];
        let bytes = strings_to_multi_sz(&input);
        assert!(!bytes.is_empty());
        let parsed = multi_sz_to_strings(&bytes);
        assert_eq!(parsed, input);
    }

    #[test]
    fn test_eligible_controller_filter() {
        // Generic Desktop (0x01) + Gamepad (0x05) -> Eligible!
        let gamepad_caps = HidpCaps {
            usage_page: 0x01,
            usage: 0x05,
            ..Default::default()
        };
        assert!(is_eligible_game_controller(&gamepad_caps));

        // Generic Desktop (0x01) + Joystick (0x04) -> Eligible!
        let joystick_caps = HidpCaps {
            usage_page: 0x01,
            usage: 0x04,
            ..Default::default()
        };
        assert!(is_eligible_game_controller(&joystick_caps));

        // Keyboard (0x01, 0x06) -> MUST NEVER BE ELIGIBLE!
        let keyboard_caps = HidpCaps {
            usage_page: 0x01,
            usage: 0x06,
            ..Default::default()
        };
        assert!(!is_eligible_game_controller(&keyboard_caps));

        // Mouse (0x01, 0x02) -> MUST NEVER BE ELIGIBLE!
        let mouse_caps = HidpCaps {
            usage_page: 0x01,
            usage: 0x02,
            ..Default::default()
        };
        assert!(!is_eligible_game_controller(&mouse_caps));

        // Other pages (e.g. Consumer audio 0x0C) -> Not eligible
        let consumer_caps = HidpCaps {
            usage_page: 0x0C,
            usage: 0x01,
            ..Default::default()
        };
        assert!(!is_eligible_game_controller(&consumer_caps));
    }

    #[test]
    fn test_hidhide_availability_does_not_panic() {
        let _ = HidHideService::is_available();
        // Deactivate when not active is a no-op
        HidHideService::deactivate();
    }
}
