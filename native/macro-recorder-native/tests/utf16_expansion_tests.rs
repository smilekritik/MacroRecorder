#![allow(dead_code, unused_imports, clippy::all)]

pub mod input_injection {
    #[rustfmt::skip]
    #[path = "../../src/input_injection/text_expansion.rs"]
    pub mod text_expansion;
}

use input_injection::text_expansion::{TextKeyUnit, VK_RETURN, expand_text_to_key_units};

#[test]
fn test_expand_text_empty_and_none() {
    assert!(expand_text_to_key_units(None).is_empty());
    assert!(expand_text_to_key_units(Some("")).is_empty());
}

#[test]
fn test_expand_text_single_ascii() {
    let units = expand_text_to_key_units(Some("Z"));
    assert_eq!(units.len(), 2);
    assert_eq!(units[0], TextKeyUnit::new(b'Z' as u16, false, false));
    assert_eq!(units[1], TextKeyUnit::new(b'Z' as u16, true, false));
}

#[test]
fn test_expand_text_ascii_string_sequence() {
    let text = "Hello, World!";
    let units = expand_text_to_key_units(Some(text));
    assert_eq!(units.len(), text.len() * 2);

    for (i, ch) in text.chars().enumerate() {
        let down = units[i * 2];
        let up = units[i * 2 + 1];

        assert_eq!(down.value, ch as u16);
        assert!(!down.key_up);
        assert!(!down.is_virtual_key);

        assert_eq!(up.value, ch as u16);
        assert!(up.key_up);
        assert!(!up.is_virtual_key);
    }
}

#[test]
fn test_expand_text_bmp_multilingual() {
    // Cyrillic
    let cyrillic = "Привет";
    let units_cyr = expand_text_to_key_units(Some(cyrillic));
    assert_eq!(units_cyr.len(), 6 * 2);
    for (i, ch) in cyrillic.chars().enumerate() {
        assert_eq!(units_cyr[i * 2].value, ch as u16);
        assert!(!units_cyr[i * 2].is_virtual_key);
    }

    // CJK
    let cjk = "日本語テスト";
    let units_cjk = expand_text_to_key_units(Some(cjk));
    assert_eq!(units_cjk.len(), 6 * 2);
    for (i, ch) in cjk.chars().enumerate() {
        assert_eq!(units_cjk[i * 2].value, ch as u16);
        assert!(!units_cjk[i * 2].is_virtual_key);
    }

    // Accented European
    let accented = "café crème";
    let units_acc = expand_text_to_key_units(Some(accented));
    assert_eq!(units_acc.len(), 10 * 2);
}

#[test]
fn test_expand_text_surrogate_pairs_emojis() {
    // Grinning face: U+1F600
    let emoji = "😀";
    let utf16: Vec<u16> = emoji.encode_utf16().collect();
    assert_eq!(
        utf16.len(),
        2,
        "Emoji U+1F600 must require 2 UTF-16 surrogates"
    );

    let units = expand_text_to_key_units(Some(emoji));
    assert_eq!(
        units.len(),
        4,
        "One surrogate pair must produce 4 key units (2 down, 2 up)"
    );

    // High surrogate
    assert_eq!(units[0], TextKeyUnit::new(utf16[0], false, false));
    assert_eq!(units[1], TextKeyUnit::new(utf16[0], true, false));

    // Low surrogate
    assert_eq!(units[2], TextKeyUnit::new(utf16[1], false, false));
    assert_eq!(units[3], TextKeyUnit::new(utf16[1], true, false));

    // Multiple emojis
    let multi_emoji = "🚀🎉🔥";
    let multi_units = expand_text_to_key_units(Some(multi_emoji));
    assert_eq!(multi_units.len(), 3 * 4); // 3 emojis * 4 units each = 12

    // Mixed text with emojis
    let mixed = "Status: 🚀 Ready!";
    let mixed_units = expand_text_to_key_units(Some(mixed));
    let expected_code_units: usize = mixed.encode_utf16().count();
    assert_eq!(mixed_units.len(), expected_code_units * 2);
}

#[test]
fn test_expand_text_newlines_all_conversions() {
    // CRLF (\r\n) is compressed into a single Enter VK down/up pair
    let crlf = expand_text_to_key_units(Some("\r\n"));
    assert_eq!(crlf.len(), 2);
    assert_eq!(crlf[0], TextKeyUnit::new(VK_RETURN, false, true));
    assert_eq!(crlf[1], TextKeyUnit::new(VK_RETURN, true, true));

    // Lone LF (\n) is emitted as a single Enter VK
    let lf = expand_text_to_key_units(Some("\n"));
    assert_eq!(lf.len(), 2);
    assert_eq!(lf[0], TextKeyUnit::new(VK_RETURN, false, true));
    assert_eq!(lf[1], TextKeyUnit::new(VK_RETURN, true, true));

    // Lone CR (\r) is emitted as a single Enter VK
    let cr = expand_text_to_key_units(Some("\r"));
    assert_eq!(cr.len(), 2);
    assert_eq!(cr[0], TextKeyUnit::new(VK_RETURN, false, true));
    assert_eq!(cr[1], TextKeyUnit::new(VK_RETURN, true, true));

    // Multiple consecutive newlines
    let double_crlf = expand_text_to_key_units(Some("\r\n\r\n"));
    assert_eq!(double_crlf.len(), 4);
    assert_eq!(double_crlf[0], TextKeyUnit::new(VK_RETURN, false, true));
    assert_eq!(double_crlf[1], TextKeyUnit::new(VK_RETURN, true, true));
    assert_eq!(double_crlf[2], TextKeyUnit::new(VK_RETURN, false, true));
    assert_eq!(double_crlf[3], TextKeyUnit::new(VK_RETURN, true, true));

    // Multiline document text
    let doc = "Line 1\r\nLine 2\nLine 3";
    let doc_units = expand_text_to_key_units(Some(doc));
    // Line 1 (6) + Enter (1) + Line 2 (6) + Enter (1) + Line 3 (6) = 20 chars -> 40 units
    assert_eq!(doc_units.len(), 40);
}

#[test]
fn test_expand_text_ordering_and_invariants() {
    let samples = [
        "Simple ASCII",
        "Unicode: Москва, 東京, 서울",
        "Code: fn main() {\r\n    println!(\"🦀\");\r\n}",
        "Special: \t\r\n~!@#$%^&*()_+",
    ];

    for &sample in &samples {
        let units = expand_text_to_key_units(Some(sample));
        assert_eq!(units.len() % 2, 0, "Units must always come in pairs");

        for i in (0..units.len()).step_by(2) {
            let down = units[i];
            let up = units[i + 1];

            assert_eq!(down.value, up.value, "Down and up values must match");
            assert_eq!(
                down.is_virtual_key, up.is_virtual_key,
                "Virtual key flags must match"
            );
            assert!(!down.key_up, "First unit of pair must be key down");
            assert!(up.key_up, "Second unit of pair must be key up");
        }
    }
}
