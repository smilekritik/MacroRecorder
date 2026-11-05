//! Hotkey binding definitions, gesture equality, and live modifier matching.

use std::fmt;
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;

/// Virtual key codes for modifier keys.
pub const VK_SHIFT: i32 = 0x10;
pub const VK_CONTROL: i32 = 0x11;
pub const VK_MENU: i32 = 0x12; // Alt
pub const VK_LWIN: i32 = 0x5B;
pub const VK_RWIN: i32 = 0x5C;

/// Win32 RegisterHotKey modifier flags.
pub const MOD_ALT: u32 = 0x0001;
pub const MOD_CONTROL: u32 = 0x0002;
pub const MOD_SHIFT: u32 = 0x0004;
pub const MOD_WIN: u32 = 0x0008;
pub const MOD_NOREPEAT: u32 = 0x4000;

/// Mouse button identifiers matching contracts and enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum MouseButton {
    #[default]
    None,
    Left,
    Right,
    Middle,
    X1,
    X2,
}

impl MouseButton {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::None => "None",
            Self::Left => "Left",
            Self::Right => "Right",
            Self::Middle => "Middle",
            Self::X1 => "X1",
            Self::X2 => "X2",
        }
    }

    pub fn from_str_name(s: &str) -> Self {
        match s {
            "Left" => Self::Left,
            "Right" => Self::Right,
            "Middle" => Self::Middle,
            "X1" => Self::X1,
            "X2" => Self::X2,
            _ => Self::None,
        }
    }
}

impl fmt::Display for MouseButton {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Wheel scroll direction matching contracts and enum.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum WheelDirection {
    #[default]
    None,
    Up,
    Down,
}

impl WheelDirection {
    pub const fn as_str(&self) -> &'static str {
        match self {
            Self::None => "None",
            Self::Up => "Up",
            Self::Down => "Down",
        }
    }

    pub fn from_str_name(s: &str) -> Self {
        match s {
            "Up" => Self::Up,
            "Down" => Self::Down,
            _ => Self::None,
        }
    }
}

impl fmt::Display for WheelDirection {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Representation of a keyboard or mouse shortcut binding.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct HotkeyBinding {
    pub virtual_key: u32,
    pub mouse_button: MouseButton,
    pub wheel: WheelDirection,
    pub control: bool,
    pub alt: bool,
    pub shift: bool,
    pub windows: bool,
}

impl HotkeyBinding {
    /// Creates an empty (unassigned) binding.
    pub fn empty() -> Self {
        Self::default()
    }

    /// Creates a keyboard shortcut binding.
    pub fn keyboard(virtual_key: u32, control: bool, alt: bool, shift: bool, windows: bool) -> Self {
        Self {
            virtual_key,
            mouse_button: MouseButton::None,
            wheel: WheelDirection::None,
            control,
            alt,
            shift,
            windows,
        }
    }

    /// Creates a mouse button shortcut binding.
    pub fn mouse(button: MouseButton, control: bool, alt: bool, shift: bool, windows: bool) -> Self {
        Self {
            virtual_key: 0,
            mouse_button: button,
            wheel: WheelDirection::None,
            control,
            alt,
            shift,
            windows,
        }
    }

    /// Creates a wheel scroll shortcut binding.
    pub fn wheel(direction: WheelDirection, control: bool, alt: bool, shift: bool, windows: bool) -> Self {
        Self {
            virtual_key: 0,
            mouse_button: MouseButton::None,
            wheel: direction,
            control,
            alt,
            shift,
            windows,
        }
    }

    /// Returns `true` if this binding contains a mouse button or wheel scroll.
    pub fn is_mouse(&self) -> bool {
        self.mouse_button != MouseButton::None || self.wheel != WheelDirection::None
    }

    /// Returns `true` if the binding is unassigned.
    pub fn is_empty(&self) -> bool {
        self.virtual_key == 0 && self.mouse_button == MouseButton::None && self.wheel == WheelDirection::None
    }

    /// Returns `true` if both bindings represent the exact same gesture.
    pub fn same_gesture(&self, other: &HotkeyBinding) -> bool {
        self.virtual_key == other.virtual_key
            && self.mouse_button == other.mouse_button
            && self.wheel == other.wheel
            && self.control == other.control
            && self.alt == other.alt
            && self.shift == other.shift
            && self.windows == other.windows
    }

    /// Computes the Win32 `RegisterHotKey` modifier flags including `MOD_NOREPEAT`.
    pub fn modifier_flags(&self) -> u32 {
        let mut flags = MOD_NOREPEAT;
        if self.alt {
            flags |= MOD_ALT;
        }
        if self.control {
            flags |= MOD_CONTROL;
        }
        if self.shift {
            flags |= MOD_SHIFT;
        }
        if self.windows {
            flags |= MOD_WIN;
        }
        flags
    }

    /// Checks whether the live physical keyboard modifier state matches this binding.
    pub fn modifiers_match(&self) -> bool {
        let ctrl = is_key_pressed(VK_CONTROL);
        let alt = is_key_pressed(VK_MENU);
        let shift = is_key_pressed(VK_SHIFT);
        let win = is_key_pressed(VK_LWIN) || is_key_pressed(VK_RWIN);

        self.control == ctrl && self.alt == alt && self.shift == shift && self.windows == win
    }
}

/// Checks if a physical key is currently held down using `GetAsyncKeyState`.
pub fn is_key_pressed(virtual_key: i32) -> bool {
    // High-order bit indicates whether the key is up or down
    unsafe { (GetAsyncKeyState(virtual_key) as u16 & 0x8000) != 0 }
}

impl fmt::Display for HotkeyBinding {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if self.is_empty() {
            return write!(f, "Not assigned");
        }
        let mut parts = Vec::new();
        if self.control {
            parts.push("Ctrl");
        }
        if self.alt {
            parts.push("Alt");
        }
        if self.shift {
            parts.push("Shift");
        }
        if self.windows {
            parts.push("Win");
        }
        match self.wheel {
            WheelDirection::Up => parts.push("Wheel up"),
            WheelDirection::Down => parts.push("Wheel down"),
            WheelDirection::None => {
                if self.mouse_button != MouseButton::None {
                    let btn_str = match self.mouse_button {
                        MouseButton::Left => "Mouse Left",
                        MouseButton::Right => "Mouse Right",
                        MouseButton::Middle => "Mouse Middle",
                        MouseButton::X1 => "Mouse X1",
                        MouseButton::X2 => "Mouse X2",
                        MouseButton::None => "",
                    };
                    parts.push(btn_str);
                } else {
                    let key_str = format!("VK_0x{:02X}", self.virtual_key);
                    return write!(f, "{}{}", parts.join(" + "), if parts.is_empty() { key_str } else { format!(" + {key_str}") });
                }
            }
        }
        write!(f, "{}", parts.join(" + "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hotkey_binding_empty_and_types() {
        let empty = HotkeyBinding::empty();
        assert!(empty.is_empty());
        assert!(!empty.is_mouse());

        let mouse_bind = HotkeyBinding::mouse(MouseButton::X2, true, false, false, false);
        assert!(!mouse_bind.is_empty());
        assert!(mouse_bind.is_mouse());

        let wheel_bind = HotkeyBinding::wheel(WheelDirection::Up, false, true, false, false);
        assert!(!wheel_bind.is_empty());
        assert!(wheel_bind.is_mouse());

        let kbd_bind = HotkeyBinding::keyboard(0x41, true, false, false, false);
        assert!(!kbd_bind.is_empty());
        assert!(!kbd_bind.is_mouse());
    }

    #[test]
    fn test_same_gesture() {
        let a = HotkeyBinding::mouse(MouseButton::X1, true, false, true, false);
        let b = HotkeyBinding::mouse(MouseButton::X1, true, false, true, false);
        let c = HotkeyBinding::mouse(MouseButton::X2, true, false, true, false);
        assert!(a.same_gesture(&b));
        assert!(!a.same_gesture(&c));
    }

    #[test]
    fn test_modifier_flags() {
        let bind = HotkeyBinding::keyboard(0x41, true, true, false, true);
        let flags = bind.modifier_flags();
        assert_ne!(flags & MOD_NOREPEAT, 0);
        assert_ne!(flags & MOD_CONTROL, 0);
        assert_ne!(flags & MOD_ALT, 0);
        assert_eq!(flags & MOD_SHIFT, 0);
        assert_ne!(flags & MOD_WIN, 0);
    }
}
