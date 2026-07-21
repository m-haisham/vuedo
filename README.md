# Pandaf

Render Vue.js components into PDFs via Gotenberg or Puppeteer. The library is framework-agnostic and can be used in any Node.js service, but the Vite plugin and CLI are Vue-specific.

## Motivation

This was born out of the frustration of having to build PDFs using templating languages. The lack of proper typesafety and the inability to use modern frontend frameworks like Vue.js or React.js to build PDFs was a huge pain point. And overtime, the maintanence of these templating languages became a nightmare. So we had an idea, what if we could use the vite ssr to render the vue components and then use puppeteer to render the html into pdf.

Having used maizzle in the past, we new it was possible to modify html files to suit our needs. This first started as a personal project to explore and learn more about vite ssr and puppeteer. Then we realized that this could be a great tool for the community and decided to open source it.

This library primarily targets to eliminate all the small friction points that come about when we try to use the chromium engine to render PDFs from HTML. The margin and padding issues, scaling issues, live preview issues (pending), and more. The goal is to make writing pdfs as simple as writing a vue component. The library is still in its early stages and we are constantly working on improving it. We welcome any contributions and feedback from the community.

## Getting Started

Install the Vue adapter and its core primitives:

```bash
pnpm add @pandaf/vue
```

See the `examples/vue/` directory for a complete Elysia backend that uses `@pandaf/vue` to render and serve PDFs. You can run it locally with:

```bash
pnpm install
pnpm run dev
```

We will be adding more documentation and examples in the future when we have ~~decoupled it from the example~~ and stabilized the api to an extend. For now, please refer to the example project for usage.

## Future Plans

We plan to extract the core library and decouple it from vue, then extend it to work with other frontend frameworks like React.js and Svelte. We also plan to add more features like live preview, custom fonts, and more.

## Disclaimer

This codebase is almost entirely written by supervised llm's. The codebase is not perfect and may contain bugs. Please report any issues you find.

## Contributing

We welcome contributions from the community. If you would like to contribute, please fork the repository and submit a pull request. We will review your changes and merge them if they are appropriate.

If you find any bugs or have any feature requests, please open an issue on GitHub. We will do our best to address them in a timely manner.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
