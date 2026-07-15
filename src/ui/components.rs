use super::traits::Draw;

#[derive(Debug, Clone)]
pub struct LabeledLine {
    label: String,
    value: Option<String>,
    warnings: Vec<String>,
    errors: Vec<String>,
}

impl LabeledLine {
    pub fn labeled(label: String) -> Self {
        Self {
            label: label.to_string(),
            value: None,
            warnings: vec![],
            errors: vec![],
        }
    }

    pub fn new(label: String, value: String) -> Self {
        Self {
            label,
            value: Some(value),
            warnings: vec![],
            errors: vec![],
        }
    }

    pub fn with_warnings(mut self, warnings: Vec<String>) -> Self {
        self.warnings = warnings;
        self
    }

    pub fn with_errors(mut self, errors: Vec<String>) -> Self {
        self.errors = errors;
        self
    }

    pub fn from_err_option<T>(label: &str, result: &eyre::Result<Option<T>>) -> Self
    where
        T: ToString,
    {
        match result {
            Ok(Some(value)) => Self::new(label.to_string(), value.to_string()),
            Ok(None) => Self::labeled(label.to_string()).with_warnings(vec!["Not set".to_string()]),
            Err(e) => Self::labeled(label.to_string()).with_errors(vec![e.to_string()]),
        }
    }
}

impl Draw for LabeledLine {
    fn draw_compact(&self, brush: &super::BrushContext<'_>) -> eyre::Result<()> {
        let normalized = NormalizedLabaledLine::from(self.clone());
        normalized.draw_compact(brush)
    }

    fn draw_verbose(&self, brush: &super::BrushContext<'_>) -> eyre::Result<()> {
        let normalized = NormalizedLabaledLine::from(self.clone());
        normalized.draw_verbose(brush)
    }
}

struct NormalizedLabaledLine {
    label: String,
    value: String,
    warnings: Vec<String>,
    errors: Vec<String>,
}

impl From<LabeledLine> for NormalizedLabaledLine {
    fn from(mut labeled_line: LabeledLine) -> Self {
        let value = labeled_line
            .value
            .as_deref()
            .or_else(|| labeled_line.errors.first().map(|v| v.as_str()))
            .or_else(|| labeled_line.warnings.first().map(|v| v.as_str()))
            .unwrap_or("Not set")
            .to_string();

        if !labeled_line.errors.is_empty() {
            labeled_line.errors = labeled_line.errors.into_iter().skip(1).collect();
        } else if !labeled_line.warnings.is_empty() {
            labeled_line.warnings = labeled_line.warnings.into_iter().skip(1).collect();
        }

        Self {
            label: labeled_line.label,
            value,
            warnings: labeled_line.warnings,
            errors: labeled_line.errors,
        }
    }
}

impl Draw for NormalizedLabaledLine {
    fn draw_compact(&self, brush: &super::BrushContext<'_>) -> eyre::Result<()> {
        let style = if !self.errors.is_empty() {
            &brush.styles.error
        } else if !self.warnings.is_empty() {
            &brush.styles.warning
        } else {
            &brush.styles.normal
        };

        let mut suffixes = vec![];

        if !self.errors.is_empty() {
            suffixes.push(format!("{} errors", self.errors.len()));
        }

        if !self.warnings.is_empty() {
            suffixes.push(format!("{} warnings", self.warnings.len()));
        }

        let suffix = if suffixes.is_empty() {
            "".to_string()
        } else {
            format!(" ({})", suffixes.join(", "))
        };

        let value = format!("{}{suffix}", self.value);

        brush.labeled_styled(&self.label, &style.apply_to(value).to_string(), style)?;

        Ok(())
    }

    fn draw_verbose(&self, brush: &super::BrushContext<'_>) -> eyre::Result<()> {
        let style = if !self.errors.is_empty() {
            &brush.styles.error
        } else if !self.warnings.is_empty() {
            &brush.styles.warning
        } else {
            &brush.styles.normal
        };

        brush.labeled_styled(&self.label, &style.apply_to(&self.value).to_string(), style)?;

        for error in &self.errors {
            brush.error_line(&error)?;
        }

        for warning in &self.warnings {
            brush.warning_line(&warning)?;
        }

        Ok(())
    }
}
