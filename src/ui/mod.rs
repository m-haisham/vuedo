pub mod components;
pub mod styles;
pub mod traits;

use console::{Style, Term};
use styles::Styles;

use crate::context::AppContext;

const LABEL_WIDTH: usize = 20;

#[derive(Debug)]
pub struct BrushContext<'a> {
    pub term: &'a Term,
    verbose: u8,
    pub indent_level: usize,
    pub styles: Styles,
}

impl<'a> BrushContext<'a> {
    pub fn new(term: &'a Term, verbose: u8) -> Self {
        Self {
            term,
            verbose,
            indent_level: 0,
            styles: Styles::new(),
        }
    }

    pub fn new_from_context(context: &'a AppContext) -> Self {
        Self::new(&context.term, context.verbose)
    }

    pub fn indent(&mut self) {
        self.indent_level += 1;
    }

    pub fn dedent(&mut self) {
        self.indent_level -= 1;
    }

    pub fn copy_with_indent(&self, indent_level: usize) -> Self {
        Self {
            term: self.term,
            verbose: self.verbose,
            indent_level,
            styles: self.styles.clone(),
        }
    }

    pub fn indented<F, R>(&self, f: F) -> R
    where
        F: FnOnce(&Self) -> R,
    {
        let indented_draw = self.copy_with_indent(self.indent_level + 1);
        f(&indented_draw)
    }

    pub fn is_verbose(&self) -> bool {
        self.verbose > 0
    }

    pub fn write_line(&self, message: &str) -> eyre::Result<()> {
        let indent = "  ".repeat(self.indent_level);
        self.term.write_line(&format!("{indent}{message}"))?;
        Ok(())
    }
}

impl BrushContext<'_> {
    #[inline]
    pub fn draw<T>(&self, drawable: &T) -> eyre::Result<()>
    where
        T: traits::Draw,
    {
        drawable.draw(self)
    }

    pub fn heading(&self, heading: &str) -> eyre::Result<()> {
        self.term
            .write_line(&Style::new().bold().apply_to(heading).to_string())?;
        Ok(())
    }

    pub fn labeled(&self, label: &str, message: &str) -> eyre::Result<()> {
        let indent = "  ".repeat(self.indent_level);

        const LABEL_WIDTH: usize = 20;

        let available_width = LABEL_WIDTH.saturating_sub(indent.len() + 1);

        let label = if label.len() > available_width {
            format!("{}…:", &label[..available_width.saturating_sub(1)])
        } else {
            format!("{label}:")
        };

        let label = format!("{indent}{label}");
        let line = format!("{label:<LABEL_WIDTH$} {message}");

        self.term.write_line(&line)?;

        Ok(())
    }

    pub fn labeled_styled(
        &self,
        label: &str,
        message: &str,
        style: &console::Style,
    ) -> eyre::Result<()> {
        let indent = "  ".repeat(self.indent_level);

        let available_width = LABEL_WIDTH.saturating_sub(indent.len() + 1);

        let label = if label.len() > available_width {
            format!("{}…:", &label[..available_width.saturating_sub(1)])
        } else {
            format!("{label}:")
        };

        let label = format!("{indent}{label}");
        let line = format!("{:<LABEL_WIDTH$} {message}", style.apply_to(label));

        self.term.write_line(&line)?;

        Ok(())
    }

    pub fn error_line(&self, message: &str) -> eyre::Result<()> {
        let label = "!!!";

        self.term.write_line(
            &self
                .styles
                .error(&format!("{label:>LABEL_WIDTH$} {message}"))
                .to_string(),
        )?;

        Ok(())
    }

    pub fn warning_line(&self, message: &str) -> eyre::Result<()> {
        let label = "!";

        self.term.write_line(
            &self
                .styles
                .warning(&format!("{label:>LABEL_WIDTH$} {message}"))
                .to_string(),
        )?;

        Ok(())
    }
}
