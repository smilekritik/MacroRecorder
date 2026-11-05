//! Unicode UTF-16 code-unit expansion and newline handling for TypeText input.
//!
//! Converts arbitrary text strings into press/release pairs of `TextKeyUnit`s:
//! - Each UTF-16 code unit is sent as a Unicode character (surrogate pairs split
//!   into two consecutive units, which Windows reassembles).
//! - Newlines (`\r\n`, `\r`, `\n`) are emitted as Enter (`VK_RETURN = 0x0D`) key presses
//!   to ensure applications handle line breaks consistently without swallowing them.
//! - Independent of keyboard layout.

/// Virtual key code for the Enter key.
pub const VK_RETURN: u16 = 0x000D;

/// A single atomic text keyboard unit: a Unicode character or a virtual key (Enter),
/// representing either a key down or key up event.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TextKeyUnit {
    /// The UTF-16 character code unit or virtual key value.
    pub value: u16,
    /// `true` for key release (up), `false` for key press (down).
    pub key_up: bool,
    /// `true` if this unit represents a virtual key (e.g. Enter), `false` for Unicode characters.
    pub is_virtual_key: bool,
}

impl TextKeyUnit {
    /// Constructs a new text key unit.
    pub const fn new(value: u16, key_up: bool, is_virtual_key: bool) -> Self {
        Self {
            value,
            key_up,
            is_virtual_key,
        }
    }
}

/// Expands a text string into a sequence of press/release key units.
///
/// Covers:
/// - Null or empty input returns an empty list.
/// - Standard characters produce a (down, up) pair of Unicode character units.
/// - Surrogate pairs produce four units (two down/up pairs, one per surrogate).
/// - CRLF (`\r\n`), lone CR (`\r`), and lone LF (`\n`) produce a single (down, up)
///   pair with `VK_RETURN` and `is_virtual_key = true`.
pub fn expand_text_to_key_units(text: Option<&str>) -> Vec<TextKeyUnit> {
    let Some(text) = text else {
        return Vec::new();
    };

    if text.is_empty() {
        return Vec::new();
    }

    let utf16: Vec<u16> = text.encode_utf16().collect();
    let mut result = Vec::with_capacity(utf16.len() * 2);

    let mut index = 0;
    while index < utf16.len() {
        let code_unit = utf16[index];

        if code_unit == b'\r' as u16 || code_unit == b'\n' as u16 {
            // If \r\n, treat as a single Enter key
            if code_unit == b'\r' as u16
                && index + 1 < utf16.len()
                && utf16[index + 1] == b'\n' as u16
            {
                index += 1;
            }

            result.push(TextKeyUnit::new(VK_RETURN, false, true));
            result.push(TextKeyUnit::new(VK_RETURN, true, true));
            index += 1;
            continue;
        }

        // Standard Unicode code unit (including high and low surrogates)
        result.push(TextKeyUnit::new(code_unit, false, false));
        result.push(TextKeyUnit::new(code_unit, true, false));
        index += 1;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_text_produces_down_up_per_code_unit() {
        // NATIVE-INPUT-021: ASCII two code units "Hi" -> 4 events (down/up each)
        let units = expand_text_to_key_units(Some("Hi"));
        assert_eq!(units.len(), 4);
        assert_eq!(units[0], TextKeyUnit::new('H' as u16, false, false));
        assert_eq!(units[1], TextKeyUnit::new('H' as u16, true, false));
        assert_eq!(units[2], TextKeyUnit::new('i' as u16, false, false));
        assert_eq!(units[3], TextKeyUnit::new('i' as u16, true, false));
    }

    #[test]
    fn test_expand_text_splits_surrogate_pairs_into_two_units() {
        // NATIVE-INPUT-022: Emoji outside BMP (U+1F600) -> 2 UTF-16 surrogates -> 4 units
        let emoji = "\u{1F600}";
        let utf16: Vec<u16> = emoji.encode_utf16().collect();
        assert_eq!(utf16.len(), 2);

        let units = expand_text_to_key_units(Some(emoji));
        assert_eq!(units.len(), 4);
        assert_eq!(units[0].value, utf16[0]);
        assert_eq!(units[2].value, utf16[1]);
        assert!(units.iter().all(|u| !u.is_virtual_key));
        assert_eq!(
            units.iter().map(|u| u.key_up).collect::<Vec<_>>(),
            vec![false, true, false, true]
        );
    }

    #[test]
    fn test_expand_text_sends_newlines_as_enter_key() {
        // NATIVE-INPUT-023: "A\r\nB" -> A (2 units) + one Enter (2 units) + B (2 units) = 6 units
        let units = expand_text_to_key_units(Some("A\r\nB"));
        assert_eq!(units.len(), 6);
        assert_eq!(units[0], TextKeyUnit::new('A' as u16, false, false));
        assert_eq!(units[1], TextKeyUnit::new('A' as u16, true, false));
        assert_eq!(units[2], TextKeyUnit::new(VK_RETURN, false, true));
        assert_eq!(units[3], TextKeyUnit::new(VK_RETURN, true, true));
        assert_eq!(units[4], TextKeyUnit::new('B' as u16, false, false));
        assert_eq!(units[5], TextKeyUnit::new('B' as u16, true, false));

        // Lone \n also becomes Enter
        let lone_lf = expand_text_to_key_units(Some("\n"));
        assert_eq!(lone_lf.len(), 2);
        assert_eq!(lone_lf[0], TextKeyUnit::new(VK_RETURN, false, true));
        assert_eq!(lone_lf[1], TextKeyUnit::new(VK_RETURN, true, true));

        // Lone \r also becomes Enter
        let lone_cr = expand_text_to_key_units(Some("\r"));
        assert_eq!(lone_cr.len(), 2);
        assert_eq!(lone_cr[0], TextKeyUnit::new(VK_RETURN, false, true));
        assert_eq!(lone_cr[1], TextKeyUnit::new(VK_RETURN, true, true));
    }

    #[test]
    fn test_expand_text_empty_is_no_input() {
        // NATIVE-INPUT-024: Empty or null string produces empty vector
        assert!(expand_text_to_key_units(Some("")).is_empty());
        assert!(expand_text_to_key_units(None).is_empty());
    }
}
