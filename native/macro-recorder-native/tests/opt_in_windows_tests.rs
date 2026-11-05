//! Opt-in Windows integration tests using dedicated, isolated test windows.
//!
//! These tests verify end-to-end background message delivery (keys, text, mouse buttons,
//! and coordinates) to a dedicated test window created specifically for this harness.
//! They NEVER steal focus or interfere with arbitrary user foreground applications.
//!
//! Run with:
//! `cargo test --test opt_in_windows_tests -- --ignored`

#![allow(dead_code, clippy::manual_range_contains)]

#[rustfmt::skip]
#[path = "../src/error.rs"]
mod error;

pub mod timing {
    #[rustfmt::skip]
    #[path = "../../src/timing/clock.rs"]
    pub mod clock;
    #[rustfmt::skip]
    #[path = "../../src/timing/waiter.rs"]
    pub mod waiter;
}

pub mod runtime {
    #[rustfmt::skip]
    #[path = "../../src/runtime/cancellation.rs"]
    pub mod cancellation;
    #[rustfmt::skip]
    #[path = "../../src/runtime/resource.rs"]
    pub mod resource;
}

pub mod input_injection {
    #[rustfmt::skip]
    #[path = "../../src/input_injection/confirmation.rs"]
    pub mod confirmation;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/facade.rs"]
    pub mod facade;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/focused_child.rs"]
    pub mod focused_child;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/global_injector.rs"]
    pub mod global_injector;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/limitations.rs"]
    pub mod limitations;
    #[rustfmt::skip]
    #[path = "../../src/input_injection/receipt.rs"]
    pub mod receipt;
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

use input_injection::state_tracker::MouseButton;
use input_injection::targeted_injector::{
    post_targeted_key, post_targeted_mouse_button, post_targeted_mouse_move, post_targeted_text,
};
use input_injection::virtual_cursor::VirtualCursorManager;
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use windows::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, MSG, PM_REMOVE, PeekMessageW,
    RegisterClassExW, TranslateMessage, UnregisterClassW, WINDOW_EX_STYLE, WM_CHAR, WM_KEYDOWN,
    WM_KEYUP, WM_LBUTTONDOWN, WM_LBUTTONUP, WM_MOUSEMOVE, WM_QUIT, WNDCLASSEXW,
    WS_OVERLAPPEDWINDOW,
};
use windows::core::PCWSTR;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReceivedMessage {
    KeyDown { vk: u32, lparam: isize },
    KeyUp { vk: u32, lparam: isize },
    Char { ch: u16 },
    MouseMove { x: i16, y: i16 },
    LButtonDown { x: i16, y: i16 },
    LButtonUp { x: i16, y: i16 },
}

static WINDOW_QUEUES: Mutex<Option<HashMap<isize, VecDeque<ReceivedMessage>>>> = Mutex::new(None);

fn init_window_queues() {
    let mut guard = WINDOW_QUEUES.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
}

extern "system" fn test_wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    let mut guard = WINDOW_QUEUES.lock().unwrap();
    if let Some(map) = guard.as_mut() {
        if let Some(queue) = map.get_mut(&(hwnd.0 as isize)) {
            match msg {
                WM_KEYDOWN => {
                    queue.push_back(ReceivedMessage::KeyDown {
                        vk: wparam.0 as u32,
                        lparam: lparam.0,
                    });
                }
                WM_KEYUP => {
                    queue.push_back(ReceivedMessage::KeyUp {
                        vk: wparam.0 as u32,
                        lparam: lparam.0,
                    });
                }
                WM_CHAR => {
                    queue.push_back(ReceivedMessage::Char {
                        ch: wparam.0 as u16,
                    });
                }
                WM_MOUSEMOVE => {
                    let x = (lparam.0 & 0xFFFF) as i16;
                    let y = ((lparam.0 >> 16) & 0xFFFF) as i16;
                    queue.push_back(ReceivedMessage::MouseMove { x, y });
                }
                WM_LBUTTONDOWN => {
                    let x = (lparam.0 & 0xFFFF) as i16;
                    let y = ((lparam.0 >> 16) & 0xFFFF) as i16;
                    queue.push_back(ReceivedMessage::LButtonDown { x, y });
                }
                WM_LBUTTONUP => {
                    let x = (lparam.0 & 0xFFFF) as i16;
                    let y = ((lparam.0 >> 16) & 0xFFFF) as i16;
                    queue.push_back(ReceivedMessage::LButtonUp { x, y });
                }
                _ => {}
            }
        }
    }
    drop(guard);

    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

struct DedicatedTestWindow {
    hwnd: HWND,
    running: Arc<AtomicBool>,
    thread_handle: Option<thread::JoinHandle<()>>,
}

impl DedicatedTestWindow {
    fn spawn() -> Self {
        init_window_queues();

        let running = Arc::new(AtomicBool::new(true));
        let running_clone = Arc::clone(&running);

        let (ready_tx, ready_rx) = std::sync::mpsc::channel();
        let class_id = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let class_name_str = format!("MacroRecorder_TestWnd_{class_id}\0");
        let class_name_wide: Vec<u16> = class_name_str.encode_utf16().collect();
        let class_name_for_thread = class_name_wide.clone();

        let thread_handle = thread::spawn(move || {
            let hinstance = HINSTANCE(std::ptr::null_mut());
            let wnd_class = WNDCLASSEXW {
                cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
                lpfnWndProc: Some(test_wnd_proc),
                hInstance: hinstance,
                lpszClassName: PCWSTR(class_name_for_thread.as_ptr()),
                ..Default::default()
            };

            let atom = unsafe { RegisterClassExW(&wnd_class) };
            if atom == 0 {
                ready_tx.send(Err("RegisterClassExW failed")).unwrap();
                return;
            }

            let hwnd_res = unsafe {
                CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    PCWSTR(class_name_for_thread.as_ptr()),
                    windows::core::w!("Dedicated Macro Recorder Test Window"),
                    WS_OVERLAPPEDWINDOW,
                    100,
                    100,
                    400,
                    300,
                    None,
                    None,
                    hinstance,
                    None,
                )
            };

            let hwnd = match hwnd_res {
                Ok(h) => h,
                Err(_) => {
                    ready_tx.send(Err("CreateWindowExW failed")).unwrap();
                    return;
                }
            };

            {
                let mut guard = WINDOW_QUEUES.lock().unwrap();
                if let Some(map) = guard.as_mut() {
                    map.insert(hwnd.0 as isize, VecDeque::new());
                }
            }

            ready_tx.send(Ok(hwnd.0 as isize)).unwrap();

            // Message pump with None to process all thread messages
            let mut msg = MSG::default();
            while running_clone.load(Ordering::SeqCst) {
                let has_msg = unsafe { PeekMessageW(&mut msg, None, 0, 0, PM_REMOVE) };
                if has_msg.as_bool() {
                    if msg.message == WM_QUIT {
                        break;
                    }
                    unsafe {
                        let _ = TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    }
                } else {
                    thread::sleep(Duration::from_millis(5));
                }
            }

            unsafe {
                let _ = DestroyWindow(hwnd);
                let _ = UnregisterClassW(PCWSTR(class_name_for_thread.as_ptr()), hinstance);
            }
        });

        let hwnd_raw = ready_rx
            .recv()
            .expect("Window thread initialization")
            .expect("Window creation");
        let hwnd = HWND(hwnd_raw as *mut _);

        Self {
            hwnd,
            running,
            thread_handle: Some(thread_handle),
        }
    }

    fn hwnd(&self) -> HWND {
        self.hwnd
    }

    fn drain_messages(&self) -> Vec<ReceivedMessage> {
        let mut guard = WINDOW_QUEUES.lock().unwrap();
        if let Some(map) = guard.as_mut() {
            if let Some(queue) = map.get_mut(&(self.hwnd.0 as isize)) {
                return queue.drain(..).collect();
            }
        }
        Vec::new()
    }
}

impl Drop for DedicatedTestWindow {
    fn drop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(handle) = self.thread_handle.take() {
            let _ = handle.join();
        }
        let mut guard = WINDOW_QUEUES.lock().unwrap();
        if let Some(map) = guard.as_mut() {
            map.remove(&(self.hwnd.0 as isize));
        }
    }
}

#[test]
fn test_integration_environment_documentation() {
    // This test always runs in unit test suites to document opt-in mechanics
    let is_enabled = std::env::var("ENABLE_WIN32_INTEGRATION_TESTS")
        .map(|v| v == "1")
        .unwrap_or(false);

    if !is_enabled {
        println!("Note: Dedicated Windows integration tests are ignored by default.");
        println!(
            "To run with dedicated test window, run: cargo test --test opt_in_windows_tests -- --ignored"
        );
    }
}

#[test]
#[ignore = "Opt-in real Win32 integration test: run with cargo test --test opt_in_windows_tests -- --ignored"]
fn test_opt_in_targeted_key_injection_dedicated_window() {
    let window = DedicatedTestWindow::spawn();
    let hwnd = window.hwnd();

    // Give window pump a brief moment to stabilize
    thread::sleep(Duration::from_millis(50));
    window.drain_messages();

    // Post VK_A down and up
    post_targeted_key(hwnd, 0x41, 0x1E, false, false).expect("Post key down");
    post_targeted_key(hwnd, 0x41, 0x1E, false, true).expect("Post key up");

    thread::sleep(Duration::from_millis(100));

    let messages = window.drain_messages();
    let key_downs: Vec<_> = messages
        .iter()
        .filter(|m| matches!(m, ReceivedMessage::KeyDown { vk: 0x41, .. }))
        .collect();
    let key_ups: Vec<_> = messages
        .iter()
        .filter(|m| matches!(m, ReceivedMessage::KeyUp { vk: 0x41, .. }))
        .collect();

    assert!(
        !key_downs.is_empty(),
        "Window should receive WM_KEYDOWN for VK_A"
    );
    assert!(
        !key_ups.is_empty(),
        "Window should receive WM_KEYUP for VK_A"
    );
}

#[test]
#[ignore = "Opt-in real Win32 integration test: run with cargo test --test opt_in_windows_tests -- --ignored"]
fn test_opt_in_targeted_text_injection_dedicated_window() {
    let window = DedicatedTestWindow::spawn();
    let hwnd = window.hwnd();

    thread::sleep(Duration::from_millis(50));
    window.drain_messages();

    post_targeted_text(hwnd, Some("Hi")).expect("Post text");

    thread::sleep(Duration::from_millis(100));

    let messages = window.drain_messages();
    let chars: Vec<u16> = messages
        .iter()
        .filter_map(|m| match m {
            ReceivedMessage::Char { ch } => Some(*ch),
            _ => None,
        })
        .collect();

    assert_eq!(chars, vec!['H' as u16, 'i' as u16]);
}

#[test]
#[ignore = "Opt-in real Win32 integration test: run with cargo test --test opt_in_windows_tests -- --ignored"]
fn test_opt_in_targeted_mouse_and_release_dedicated_window() {
    let window = DedicatedTestWindow::spawn();
    let hwnd = window.hwnd();
    let cursor_manager = VirtualCursorManager::new();

    thread::sleep(Duration::from_millis(50));
    window.drain_messages();

    // Move to (120, 80) and click left button
    post_targeted_mouse_move(hwnd, 120, 80, &cursor_manager).expect("Move mouse");
    post_targeted_mouse_button(hwnd, MouseButton::Left, true, &cursor_manager)
        .expect("Button down");
    post_targeted_mouse_button(hwnd, MouseButton::Left, false, &cursor_manager).expect("Button up");

    thread::sleep(Duration::from_millis(100));

    let messages = window.drain_messages();
    let has_move = messages
        .iter()
        .any(|m| matches!(m, ReceivedMessage::MouseMove { .. }));
    let has_down = messages
        .iter()
        .any(|m| matches!(m, ReceivedMessage::LButtonDown { .. }));
    let has_up = messages
        .iter()
        .any(|m| matches!(m, ReceivedMessage::LButtonUp { .. }));

    assert!(has_move, "Window should receive WM_MOUSEMOVE");
    assert!(has_down, "Window should receive WM_LBUTTONDOWN");
    assert!(has_up, "Window should receive WM_LBUTTONUP");
}
