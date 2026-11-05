#![allow(dead_code, unused_imports, clippy::all)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
pub mod error;

pub mod input_injection {
    #[rustfmt::skip]
    #[path = "../../src/input_injection/focused_child.rs"]
    pub mod focused_child;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/limitations.rs"]
    pub mod limitations;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/scan_code.rs"]
    pub mod scan_code;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/state_tracker.rs"]
    pub mod state_tracker;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/targeted_injector.rs"]
    pub mod targeted_injector;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/text_expansion.rs"]
    pub mod text_expansion;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/virtual_cursor.rs"]
    pub mod virtual_cursor;
}

use error::IpcErrorCode;
use input_injection::focused_child::resolve_keyboard_target;
use input_injection::limitations::validate_targeted_window;
use input_injection::scan_code::{make_keyboard_lparam, resolve_scan_code};
use input_injection::state_tracker::MouseButton;
use input_injection::targeted_injector::{make_lparam, make_wparam};
use input_injection::virtual_cursor::VirtualCursorManager;

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::WindowsAndMessaging::{
    WM_CHAR, WM_KEYDOWN, WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MBUTTONDOWN, WM_MBUTTONUP,
    WM_MOUSEHWHEEL, WM_MOUSEMOVE, WM_MOUSEWHEEL, WM_RBUTTONDOWN, WM_RBUTTONUP, WM_XBUTTONDOWN,
    WM_XBUTTONUP,
};

#[test]
fn test_make_lparam_coordinate_packing() {
    // Standard positive coordinates
    let lp = make_lparam(100, 200);
    assert_eq!(lp.0 & 0xFFFF, 100);
    assert_eq!((lp.0 >> 16) & 0xFFFF, 200);

    // Screen origin
    let lp_zero = make_lparam(0, 0);
    assert_eq!(lp_zero.0, 0);

    // Common screen resolutions (1920, 1080)
    let lp_1080p = make_lparam(1920, 1080);
    assert_eq!(lp_1080p.0 & 0xFFFF, 1920);
    assert_eq!((lp_1080p.0 >> 16) & 0xFFFF, 1080);

    // 4K resolution (3840, 2160)
    let lp_4k = make_lparam(3840, 2160);
    assert_eq!(lp_4k.0 & 0xFFFF, 3840);
    assert_eq!((lp_4k.0 >> 16) & 0xFFFF, 2160);

    // Negative coordinates (multi-monitor setups with secondary screen to the left/top)
    let lp_neg = make_lparam(-50, -100);
    let low = (lp_neg.0 & 0xFFFF) as i16;
    let high = ((lp_neg.0 >> 16) & 0xFFFF) as i16;
    assert_eq!(low, -50);
    assert_eq!(high, -100);
}

#[test]
fn test_make_wparam_packing() {
    let wp = make_wparam(10, 20);
    assert_eq!(wp.0 & 0xFFFF, 10);
    assert_eq!((wp.0 >> 16) & 0xFFFF, 20);

    // Wheel delta positive (+120, WHEEL_DELTA forward)
    let wp_wheel_up = make_wparam(0, 120);
    assert_eq!(wp_wheel_up.0 & 0xFFFF, 0);
    assert_eq!(((wp_wheel_up.0 >> 16) & 0xFFFF) as i16, 120);

    // Wheel delta negative (-120, WHEEL_DELTA backward)
    let wp_wheel_down = make_wparam(0, -120);
    assert_eq!(wp_wheel_down.0 & 0xFFFF, 0);
    assert_eq!(((wp_wheel_down.0 >> 16) & 0xFFFF) as i16, -120);

    // XBUTTON1 (1 in high word) and XBUTTON2 (2 in high word)
    let wp_x1 = make_wparam(0, 1);
    assert_eq!((wp_x1.0 >> 16) & 0xFFFF, 1);

    let wp_x2 = make_wparam(0, 2);
    assert_eq!((wp_x2.0 >> 16) & 0xFFFF, 2);
}

#[test]
fn test_make_keyboard_lparam_bitfields() {
    // Key down, non-extended key 'A' (VK 0x41, scan code 0x1E)
    let lp_down = make_keyboard_lparam(0x41, 0x1E, false, false);
    assert_eq!(lp_down & 0xFFFF, 1, "Repeat count must be 1 (bits 0-15)");
    assert_eq!((lp_down >> 16) & 0xFF, 0x1E, "OEM scan code in bits 16-23");
    assert_eq!(
        (lp_down >> 24) & 1,
        0,
        "Extended key flag must be 0 for standard key"
    );
    assert_eq!(
        (lp_down >> 29) & 1,
        0,
        "Context code must be 0 for standard key"
    );
    assert_eq!(
        (lp_down >> 30) & 1,
        0,
        "Previous key state must be 0 on KeyDown"
    );
    assert_eq!(
        (lp_down >> 31) & 1,
        0,
        "Transition state must be 0 on KeyDown"
    );

    // Key up, non-extended key 'A'
    let lp_up = make_keyboard_lparam(0x41, 0x1E, false, true);
    assert_eq!(lp_up & 0xFFFF, 1, "Repeat count must be 1");
    assert_eq!(
        (lp_up >> 16) & 0xFF,
        0x1E,
        "OEM scan code preserved on KeyUp"
    );
    assert_eq!((lp_up >> 24) & 1, 0, "Extended key flag 0");
    assert_eq!(
        (lp_up >> 30) & 1,
        1,
        "Previous key state must be 1 on KeyUp"
    );
    assert_eq!((lp_up >> 31) & 1, 1, "Transition state must be 1 on KeyUp");

    // Key down, extended key (e.g. Left Arrow, VK 0x25, scan code 0x4B)
    let lp_ext_down = make_keyboard_lparam(0x25, 0x4B, true, false);
    assert_eq!(lp_ext_down & 0xFFFF, 1);
    assert_eq!((lp_ext_down >> 16) & 0xFF, 0x4B);
    assert_eq!(
        (lp_ext_down >> 24) & 1,
        1,
        "Extended key flag must be 1 for extended keys"
    );
    assert_eq!((lp_ext_down >> 30) & 1, 0);
    assert_eq!((lp_ext_down >> 31) & 1, 0);

    // Key up, extended key
    let lp_ext_up = make_keyboard_lparam(0x25, 0x4B, true, true);
    assert_eq!((lp_ext_up >> 24) & 1, 1, "Extended flag preserved on KeyUp");
    assert_eq!((lp_ext_up >> 30) & 1, 1);
    assert_eq!((lp_ext_up >> 31) & 1, 1);
}

#[test]
fn test_validate_targeted_window_rejects_invalid_handles() {
    let null_hwnd = HWND::default();
    let err_null = validate_targeted_window(null_hwnd).unwrap_err();
    assert_eq!(err_null.code, IpcErrorCode::WindowNotFound);

    let invalid_hwnd = HWND(-1isize as *mut _);
    let err_invalid = validate_targeted_window(invalid_hwnd).unwrap_err();
    assert_eq!(err_invalid.code, IpcErrorCode::WindowNotFound);

    let bogus_hwnd = HWND(0xDEADBEEF as *mut _);
    let err_bogus = validate_targeted_window(bogus_hwnd).unwrap_err();
    assert_eq!(err_bogus.code, IpcErrorCode::WindowNotFound);
}

#[test]
fn test_virtual_cursor_manager_tracking_and_cleanup() {
    let cursor_mgr = VirtualCursorManager::new();
    let fake_hwnd1 = HWND(0x1111 as *mut _);
    let fake_hwnd2 = HWND(0x2222 as *mut _);

    let initial1 = cursor_mgr.get_or_init(fake_hwnd1);
    assert_eq!(initial1, (0, 0));

    let moved1 = cursor_mgr.move_cursor(fake_hwnd1, 50, 75);
    assert_eq!(moved1, (50, 75));

    let moved2 = cursor_mgr.move_cursor(fake_hwnd1, -10, 25);
    assert_eq!(moved2, (40, 100));

    let moved_other = cursor_mgr.move_cursor(fake_hwnd2, 300, 400);
    assert_eq!(moved_other, (300, 400));

    assert_eq!(cursor_mgr.get_or_init(fake_hwnd1), (40, 100));

    cursor_mgr.remove(fake_hwnd1);
    assert_eq!(cursor_mgr.get_or_init(fake_hwnd1), (0, 0));
}

#[test]
fn test_resolve_keyboard_target_invariants() {
    let null_hwnd = HWND::default();
    assert_eq!(resolve_keyboard_target(null_hwnd), null_hwnd);

    let invalid_hwnd = HWND(-1isize as *mut _);
    assert_eq!(resolve_keyboard_target(invalid_hwnd), invalid_hwnd);
}

#[test]
fn test_win32_window_message_constant_values() {
    assert_eq!(WM_KEYDOWN, 0x0100);
    assert_eq!(WM_KEYUP, 0x0101);
    assert_eq!(WM_CHAR, 0x0102);

    assert_eq!(WM_MOUSEMOVE, 0x0200);
    assert_eq!(WM_LBUTTONDOWN, 0x0201);
    assert_eq!(WM_LBUTTONUP, 0x0202);
    assert_eq!(WM_RBUTTONDOWN, 0x0204);
    assert_eq!(WM_RBUTTONUP, 0x0205);
    assert_eq!(WM_MBUTTONDOWN, 0x0207);
    assert_eq!(WM_MBUTTONUP, 0x0208);
    assert_eq!(WM_XBUTTONDOWN, 0x020B);
    assert_eq!(WM_XBUTTONUP, 0x020C);

    assert_eq!(WM_MOUSEWHEEL, 0x020A);
    assert_eq!(WM_MOUSEHWHEEL, 0x020E);
}
