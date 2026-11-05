//! Windows.Gaming.Input (WGI) COM / WinRT bindings for raw game controllers (e.g. DualShock 4).
//!
//! Implements duplicate filtering so any controller that is simultaneously visible as an XInput
//! gamepad is ignored here, avoiding duplicate input.

use std::ffi::c_void;
use std::ptr::{null_mut, NonNull};
use std::sync::OnceLock;
use windows::Win32::Foundation::HMODULE;

extern "system" {
    fn LoadLibraryW(lpLibFileName: *const u16) -> HMODULE;
    fn GetProcAddress(hModule: HMODULE, lpProcName: *const u8) -> *mut c_void;
}

#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Guid {
    pub data1: u32,
    pub data2: u16,
    pub data3: u16,
    pub data4: [u8; 8],
}

impl Guid {
    pub const fn from_values(d1: u32, d2: u16, d3: u16, d4: [u8; 8]) -> Self {
        Self { data1: d1, data2: d2, data3: d3, data4: d4 }
    }
}

#[allow(dead_code)]
const IID_IUNKNOWN: Guid = Guid::from_values(0x00000000, 0x0000, 0x0000, [0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46]);
const IID_IRAW_GAME_CONTROLLER_STATICS: Guid = Guid::from_values(0xEB8D0792, 0xE95A, 0x4B19, [0xAF, 0xC7, 0x0A, 0x59, 0xF8, 0xBF, 0x75, 0x9E]);
#[allow(dead_code)]
const IID_IRAW_GAME_CONTROLLER: Guid = Guid::from_values(0x7C120000, 0x8433, 0x4F90, [0x84, 0x94, 0xB7, 0x88, 0x09, 0x49, 0x31, 0x16]);
const IID_IRAW_GAME_CONTROLLER2: Guid = Guid::from_values(0x43C0C035, 0xBB73, 0x4756, [0xA7, 0x87, 0x3E, 0xD6, 0xBE, 0xA6, 0x17, 0xBD]);
const IID_IGAMEPAD_STATICS2: Guid = Guid::from_values(0x42676DC5, 0x0856, 0x47C4, [0x92, 0x13, 0xB3, 0x95, 0x50, 0x4C, 0x3A, 0x3C]);

type HRESULT = i32;
type HSTRING = *mut c_void;

#[repr(C)]
struct IUnknownVtbl {
    query_interface: unsafe extern "system" fn(*mut c_void, *const Guid, *mut *mut c_void) -> HRESULT,
    add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
    release: unsafe extern "system" fn(*mut c_void) -> u32,
}

#[repr(C)]
struct IInspectableVtbl {
    parent: IUnknownVtbl,
    get_iids: unsafe extern "system" fn(*mut c_void, *mut u32, *mut *mut Guid) -> HRESULT,
    get_runtime_class_name: unsafe extern "system" fn(*mut c_void, *mut HSTRING) -> HRESULT,
    get_trust_level: unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT,
}

#[repr(C)]
struct IVectorViewVtbl {
    parent: IInspectableVtbl,
    get_at: unsafe extern "system" fn(*mut c_void, u32, *mut *mut c_void) -> HRESULT,
    get_size: unsafe extern "system" fn(*mut c_void, *mut u32) -> HRESULT,
    index_of: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut u32, *mut bool) -> HRESULT,
    get_many: unsafe extern "system" fn(*mut c_void, u32, u32, *mut *mut c_void, *mut u32) -> HRESULT,
}

#[repr(C)]
struct IRawGameControllerStaticsVtbl {
    parent: IInspectableVtbl,
    add_raw_game_controller_added: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut i64) -> HRESULT,
    remove_raw_game_controller_added: unsafe extern "system" fn(*mut c_void, i64) -> HRESULT,
    add_raw_game_controller_removed: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut i64) -> HRESULT,
    remove_raw_game_controller_removed: unsafe extern "system" fn(*mut c_void, i64) -> HRESULT,
    get_raw_game_controllers: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
    from_game_controller: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut *mut c_void) -> HRESULT,
}

#[repr(C)]
struct IRawGameControllerVtbl {
    parent: IInspectableVtbl,
    get_axis_count: unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT,
    get_button_count: unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT,
    get_force_feedback_motors: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
    get_hardware_product_id: unsafe extern "system" fn(*mut c_void, *mut u16) -> HRESULT,
    get_hardware_vendor_id: unsafe extern "system" fn(*mut c_void, *mut u16) -> HRESULT,
    get_switch_count: unsafe extern "system" fn(*mut c_void, *mut i32) -> HRESULT,
    get_button_label: unsafe extern "system" fn(*mut c_void, i32, *mut i32) -> HRESULT,
    get_current_reading: unsafe extern "system" fn(
        *mut c_void,
        u32,
        *mut bool,
        u32,
        *mut i32,
        u32,
        *mut f64,
        *mut u64,
    ) -> HRESULT,
    get_switch_kind: unsafe extern "system" fn(*mut c_void, i32, *mut i32) -> HRESULT,
}

#[repr(C)]
struct IRawGameController2Vtbl {
    parent: IInspectableVtbl,
    get_simple_haptics_controllers: unsafe extern "system" fn(*mut c_void, *mut *mut c_void) -> HRESULT,
    get_non_roamable_id: unsafe extern "system" fn(*mut c_void, *mut HSTRING) -> HRESULT,
    get_display_name: unsafe extern "system" fn(*mut c_void, *mut HSTRING) -> HRESULT,
}

#[repr(C)]
struct IGamepadStatics2Vtbl {
    parent: IInspectableVtbl,
    from_game_controller: unsafe extern "system" fn(*mut c_void, *mut c_void, *mut *mut c_void) -> HRESULT,
}

/// Generic COM smart pointer.
pub struct ComPtr<T> {
    ptr: NonNull<T>,
}

impl<T> ComPtr<T> {
    pub fn new(ptr: *mut T) -> Option<Self> {
        NonNull::new(ptr).map(|ptr| Self { ptr })
    }

    pub fn as_raw(&self) -> *mut c_void {
        self.ptr.as_ptr() as *mut c_void
    }
}

impl<T> Drop for ComPtr<T> {
    fn drop(&mut self) {
        unsafe {
            let unknown = self.ptr.as_ptr() as *mut *mut IUnknownVtbl;
            let vtbl = &**unknown;
            (vtbl.release)(self.as_raw());
        }
    }
}

impl<T> Clone for ComPtr<T> {
    fn clone(&self) -> Self {
        unsafe {
            let unknown = self.ptr.as_ptr() as *mut *mut IUnknownVtbl;
            let vtbl = &**unknown;
            (vtbl.add_ref)(self.as_raw());
        }
        Self { ptr: self.ptr }
    }
}

unsafe impl<T> Send for ComPtr<T> {}
unsafe impl<T> Sync for ComPtr<T> {}

// Dynamically loaded WinRT APIs from combase.dll
type FnRoInitialize = unsafe extern "system" fn(init_type: i32) -> HRESULT;
type FnRoGetActivationFactory = unsafe extern "system" fn(HSTRING, *const Guid, *mut *mut c_void) -> HRESULT;
type FnWindowsCreateString = unsafe extern "system" fn(*const u16, u32, *mut HSTRING) -> HRESULT;
type FnWindowsDeleteString = unsafe extern "system" fn(HSTRING) -> HRESULT;
type FnWindowsGetStringRawBuffer = unsafe extern "system" fn(HSTRING, *mut u32) -> *const u16;

struct CombaseApi {
    ro_get_activation_factory: FnRoGetActivationFactory,
    create_string: FnWindowsCreateString,
    delete_string: FnWindowsDeleteString,
    get_string_buffer: FnWindowsGetStringRawBuffer,
}

static COMBASE_API: OnceLock<Option<CombaseApi>> = OnceLock::new();

fn load_combase() -> Option<CombaseApi> {
    let dll_name: Vec<u16> = "combase.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(dll_name.as_ptr()) };
    if module.is_invalid() || module.0.is_null() {
        return None;
    }

    // Optional RoInitialize if needed
    let ro_init_proc = unsafe { GetProcAddress(module, b"RoInitialize\0".as_ptr()) };
    if !ro_init_proc.is_null() {
        let ro_init: FnRoInitialize = unsafe { std::mem::transmute(ro_init_proc) };
        unsafe { ro_init(1) }; // RO_INIT_MULTITHREADED = 1
    }

    let p1 = unsafe { GetProcAddress(module, b"RoGetActivationFactory\0".as_ptr()) };
    let p2 = unsafe { GetProcAddress(module, b"WindowsCreateString\0".as_ptr()) };
    let p3 = unsafe { GetProcAddress(module, b"WindowsDeleteString\0".as_ptr()) };
    let p4 = unsafe { GetProcAddress(module, b"WindowsGetStringRawBuffer\0".as_ptr()) };

    if p1.is_null() || p2.is_null() || p3.is_null() || p4.is_null() {
        return None;
    }

    Some(CombaseApi {
        ro_get_activation_factory: unsafe { std::mem::transmute(p1) },
        create_string: unsafe { std::mem::transmute(p2) },
        delete_string: unsafe { std::mem::transmute(p3) },
        get_string_buffer: unsafe { std::mem::transmute(p4) },
    })
}

fn get_combase() -> Option<&'static CombaseApi> {
    COMBASE_API.get_or_init(load_combase).as_ref()
}

fn create_hstring(api: &CombaseApi, s: &str) -> Option<HSTRING> {
    let utf16: Vec<u16> = s.encode_utf16().collect();
    let mut hstr: HSTRING = null_mut();
    let hr = unsafe { (api.create_string)(utf16.as_ptr(), utf16.len() as u32, &mut hstr) };
    if hr >= 0 {
        Some(hstr)
    } else {
        None
    }
}

fn hstring_to_string(api: &CombaseApi, hstr: HSTRING) -> String {
    if hstr.is_null() {
        return String::new();
    }
    let mut len = 0u32;
    let ptr = unsafe { (api.get_string_buffer)(hstr, &mut len) };
    if ptr.is_null() || len == 0 {
        return String::new();
    }
    let slice = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
    String::from_utf16_lossy(slice)
}

/// Representation of a connected WGI Raw Game Controller.
pub struct WgiRawController {
    raw_ptr: ComPtr<c_void>,
    button_count: i32,
    switch_count: i32,
    axis_count: i32,
    display_name: String,
}

unsafe impl Send for WgiRawController {}
unsafe impl Sync for WgiRawController {}

impl WgiRawController {
    pub fn button_count(&self) -> i32 {
        self.button_count
    }

    pub fn switch_count(&self) -> i32 {
        self.switch_count
    }

    pub fn axis_count(&self) -> i32 {
        self.axis_count
    }

    pub fn display_name(&self) -> &str {
        &self.display_name
    }

    /// Reads current state of buttons, switches, and axes.
    pub fn get_current_reading(
        &self,
        buttons: &mut [bool],
        switches: &mut [i32],
        axes: &mut [f64],
    ) -> bool {
        unsafe {
            let vtbl_ptr = *(self.raw_ptr.as_raw() as *mut *mut IRawGameControllerVtbl);
            let mut timestamp: u64 = 0;
            let hr = ((*vtbl_ptr).get_current_reading)(
                self.raw_ptr.as_raw(),
                buttons.len() as u32,
                buttons.as_mut_ptr(),
                switches.len() as u32,
                switches.as_mut_ptr(),
                axes.len() as u32,
                axes.as_mut_ptr(),
                &mut timestamp,
            );
            hr >= 0
        }
    }

    /// Retrieves the semantic button label for the specified button index.
    pub fn get_button_label(&self, index: i32) -> i32 {
        unsafe {
            let vtbl_ptr = *(self.raw_ptr.as_raw() as *mut *mut IRawGameControllerVtbl);
            let mut label: i32 = 0;
            let hr = ((*vtbl_ptr).get_button_label)(self.raw_ptr.as_raw(), index, &mut label);
            if hr >= 0 {
                label
            } else {
                0
            }
        }
    }
}

/// Checks if a raw game controller is recognized as an XInput Gamepad (Xbox pad).
/// If true, it should be skipped in WGI polling to prevent double events.
fn is_xinput_controller(api: &CombaseApi, controller_ptr: *mut c_void) -> bool {
    let class_name = match create_hstring(api, "Windows.Gaming.Input.Gamepad") {
        Some(h) => h,
        None => return false,
    };

    let mut factory_ptr: *mut c_void = null_mut();
    let hr = unsafe {
        (api.ro_get_activation_factory)(
            class_name,
            &IID_IGAMEPAD_STATICS2,
            &mut factory_ptr,
        )
    };
    unsafe { (api.delete_string)(class_name) };

    if hr < 0 || factory_ptr.is_null() {
        return false;
    }
    let factory = match ComPtr::new(factory_ptr) {
        Some(f) => f,
        None => return false,
    };

    unsafe {
        let vtbl_ptr = *(factory.as_raw() as *mut *mut IGamepadStatics2Vtbl);
        let mut gamepad_ptr: *mut c_void = null_mut();
        let hr = ((*vtbl_ptr).from_game_controller)(
            factory.as_raw(),
            controller_ptr,
            &mut gamepad_ptr,
        );
        if hr >= 0 && !gamepad_ptr.is_null() {
            let _release = ComPtr::new(gamepad_ptr);
            true // Recognized as XInput!
        } else {
            false
        }
    }
}

/// Enumerates all connected non-XInput WGI RawGameControllers (e.g. DualShock 4).
/// Any pad that is also an XInput Gamepad is filtered out.
pub fn enumerate_wgi_controllers() -> Vec<WgiRawController> {
    let api = match get_combase() {
        Some(a) => a,
        None => return Vec::new(),
    };

    let class_name = match create_hstring(api, "Windows.Gaming.Input.RawGameController") {
        Some(h) => h,
        None => return Vec::new(),
    };

    let mut statics_ptr: *mut c_void = null_mut();
    let hr = unsafe {
        (api.ro_get_activation_factory)(
            class_name,
            &IID_IRAW_GAME_CONTROLLER_STATICS,
            &mut statics_ptr,
        )
    };
    unsafe { (api.delete_string)(class_name) };

    if hr < 0 || statics_ptr.is_null() {
        return Vec::new();
    }
    let statics = match ComPtr::new(statics_ptr) {
        Some(s) => s,
        None => return Vec::new(),
    };

    let mut vector_view_ptr: *mut c_void = null_mut();
    unsafe {
        let vtbl = *(statics.as_raw() as *mut *mut IRawGameControllerStaticsVtbl);
        let hr = ((*vtbl).get_raw_game_controllers)(statics.as_raw(), &mut vector_view_ptr);
        if hr < 0 || vector_view_ptr.is_null() {
            return Vec::new();
        }
    }
    let vector_view = match ComPtr::new(vector_view_ptr) {
        Some(v) => v,
        None => return Vec::new(),
    };

    let mut size = 0u32;
    unsafe {
        let vtbl = *(vector_view.as_raw() as *mut *mut IVectorViewVtbl);
        let hr = ((*vtbl).get_size)(vector_view.as_raw(), &mut size);
        if hr < 0 {
            return Vec::new();
        }
    }

    let mut results = Vec::new();
    for i in 0..size {
        let mut controller_ptr: *mut c_void = null_mut();
        unsafe {
            let vtbl = *(vector_view.as_raw() as *mut *mut IVectorViewVtbl);
            let hr = ((*vtbl).get_at)(vector_view.as_raw(), i, &mut controller_ptr);
            if hr < 0 || controller_ptr.is_null() {
                continue;
            }
        }
        let controller = match ComPtr::new(controller_ptr) {
            Some(c) => c,
            None => continue,
        };

        // Filter out XInput duplicates!
        if is_xinput_controller(api, controller.as_raw()) {
            continue;
        }

        let mut button_count = 0i32;
        let mut switch_count = 0i32;
        let mut axis_count = 0i32;
        unsafe {
            let vtbl = *(controller.as_raw() as *mut *mut IRawGameControllerVtbl);
            let _ = ((*vtbl).get_button_count)(controller.as_raw(), &mut button_count);
            let _ = ((*vtbl).get_switch_count)(controller.as_raw(), &mut switch_count);
            let _ = ((*vtbl).get_axis_count)(controller.as_raw(), &mut axis_count);
        }

        // Query display name via IRawGameController2
        let mut display_name = String::from("gamepad");
        let mut controller2_ptr: *mut c_void = null_mut();
        unsafe {
            let unknown = *(controller.as_raw() as *mut *mut IUnknownVtbl);
            let hr = ((*unknown).query_interface)(
                controller.as_raw(),
                &IID_IRAW_GAME_CONTROLLER2,
                &mut controller2_ptr,
            );
            if hr >= 0 && !controller2_ptr.is_null() {
                let controller2 = ComPtr::new(controller2_ptr);
                if let Some(c2) = controller2 {
                    let vtbl2 = *(c2.as_raw() as *mut *mut IRawGameController2Vtbl);
                    let mut name_hstr: HSTRING = null_mut();
                    let hr2 = ((*vtbl2).get_display_name)(c2.as_raw(), &mut name_hstr);
                    if hr2 >= 0 && !name_hstr.is_null() {
                        let name = hstring_to_string(api, name_hstr);
                        (api.delete_string)(name_hstr);
                        if !name.trim().is_empty() {
                            display_name = name;
                        }
                    }
                }
            }
        }

        results.push(WgiRawController {
            raw_ptr: controller,
            button_count: button_count.max(0),
            switch_count: switch_count.max(0),
            axis_count: axis_count.max(0),
            display_name,
        });
    }

    results
}

/// Checks if any non-XInput WGI raw controllers are connected.
pub fn any_wgi_connected() -> bool {
    !enumerate_wgi_controllers().is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_combase_loading() {
        // combase.dll is a core Windows DLL and should be present on Win10/11
        let combase = get_combase();
        assert!(combase.is_some(), "combase.dll should load on Windows 10/11");
    }

    #[test]
    fn test_enumerate_wgi_does_not_panic() {
        let controllers = enumerate_wgi_controllers();
        // Even if no physical controllers are attached, this must return cleanly
        assert!(controllers.len() <= 32);
    }
}
