use std::{fmt::Display, ops::Deref, str::FromStr};

#[derive(Debug, Clone)]
pub struct Kebab(String);

impl Kebab {
    pub fn into_inner(self) -> String {
        self.0
    }
}

impl AsRef<str> for Kebab {
    fn as_ref(&self) -> &str {
        &self.0
    }
}

impl Deref for Kebab {
    type Target = str;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Display for Kebab {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

impl FromStr for Kebab {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        if is_kebab(s) {
            Ok(Kebab(s.to_owned()))
        } else {
            Err(format!("'{}' is not kebab-case", s))
        }
    }
}

pub fn is_kebab(name: &str) -> bool {
    if name.starts_with('-') || name.ends_with('-') {
        return false;
    }

    if name.contains("--") {
        return false;
    }

    name.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

pub fn kebabify(name: &str) -> Kebab {
    let mut kebab = String::with_capacity(name.len());
    let mut last_was_dash = false;

    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            kebab.push(c.to_ascii_lowercase());
            last_was_dash = false;
        } else if (c == ' ' || c == '_' || c == '-') && !last_was_dash {
            kebab.push('-');
            last_was_dash = true;
        }
    }

    Kebab(kebab)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_kebab() {
        assert!(is_kebab("hello-world"));
        assert!(!is_kebab("hello_world"));
        assert!(!is_kebab("hello world"));
        assert!(!is_kebab("hello-World"));
        assert!(!is_kebab("hello-"));
        assert!(!is_kebab("-world"));
    }

    #[test]
    fn test_kebabify() {
        let cases = vec![
            ("Hello World", "hello-world"),
            ("HelloWorld", "helloworld"),
            ("hello_world", "hello-world"),
            ("hello-world", "hello-world"),
            ("hello - world", "hello-world"),
            ("hello--world", "hello-world"),
        ];

        for (input, expected) in cases {
            let kebab = kebabify(input);
            assert_eq!(
                kebab.as_ref(),
                expected,
                "kebabify({}) {} != {}",
                input,
                kebab,
                expected
            );
        }
    }
}
