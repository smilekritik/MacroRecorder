//! Generated TypeScript declarations and contract schema verification.

/// Raw TypeScript declaration content generated from audited N-API bindings.
pub const TYPESCRIPT_DECLARATIONS: &str = include_str!("index.d.ts");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_declarations_non_empty() {
        assert!(!TYPESCRIPT_DECLARATIONS.is_empty());
        assert!(TYPESCRIPT_DECLARATIONS.contains("InjectKeyboardCommand"));
        assert!(TYPESCRIPT_DECLARATIONS.contains("NativeFoundationSession"));
        assert!(TYPESCRIPT_DECLARATIONS.contains("injectKeyboard"));
        assert!(TYPESCRIPT_DECLARATIONS.contains("injectMouse"));
        assert!(TYPESCRIPT_DECLARATIONS.contains("releaseAllInputs"));
    }
}
