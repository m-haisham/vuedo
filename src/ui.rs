use console::Term;

use crate::context::AppContext;

#[derive(Debug)]
pub struct DrawContext<'a> {
    pub term: &'a Term,
    verbose: u8,
    pub indent_level: usize,
}

impl<'a> DrawContext<'a> {
    pub fn new(term: &'a Term, verbose: u8) -> Self {
        Self {
            term,
            verbose,
            indent_level: 0,
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

    pub fn is_verbose(&self) -> bool {
        self.verbose > 0
    }

    pub fn write_line(&self, message: &str) -> eyre::Result<()> {
        let indent = "  ".repeat(self.indent_level);
        self.term.write_line(&format!("{indent}{message}"))?;
        Ok(())
    }
}

impl DrawContext<'_> {
    pub fn heading(&self, heading: &str) -> eyre::Result<()> {
        self.term.write_line(&format!("== {heading} =="))?;
        Ok(())
    }

    pub fn draw_labeled(&self, label: &str, value: &str) -> eyre::Result<()> {
        let indent = "  ".repeat(self.indent_level);

        const LABEL_WIDTH: usize = 20;

        let available_width = LABEL_WIDTH.saturating_sub(indent.len() + 1);

        let label = if label.len() > available_width {
            format!("{}…:", &label[..available_width.saturating_sub(1)])
        } else {
            format!("{label}:")
        };

        let label = format!("{indent}{label}");
        let line = format!("{label:<LABEL_WIDTH$} {value}");

        self.term.write_line(&line)?;

        Ok(())
    }
}
