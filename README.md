# @audinue/bun-plugin-vanilla-extract 🧁

**Bun plugin for [vanilla-extract](https://vanilla-extract.style) — Zero-runtime Stylesheets-in-TypeScript.**

Write your CSS in TypeScript, get static CSS files at build time. No runtime overhead! 🔥

## Install

```bash
bun add -D @audinue/bun-plugin-vanilla-extract @vanilla-extract/css
```

## Usage

### Basic setup

```ts
import { vanillaExtractPlugin } from '@audinue/bun-plugin-vanilla-extract';

await Bun.build({
  entrypoints: ['./src/app.ts'],
  outdir: './dist',
  plugins: [vanillaExtractPlugin()],
});
```

### With options

```ts
vanillaExtractPlugin({
  identOption: 'short',        // 'short' (prod) | 'debug' (dev)
  emitCss: true,               // Write CSS to filesystem
  emitSingleCss: true,         // Combine all CSS into one file
  cssFileName: 'styles.css',   // Name of combined CSS file
  cssOutDir: './dist/css',     // Custom CSS output directory
  esbuildOptions: {            // Pass through to internal esbuild
    external: ['some-package'],
    define: { 'process.env.FOO': '"bar"' },
  },
});
```

## How it works

1. Bun's bundler intercepts `.css.ts` files via `onLoad`
2. `@vanilla-extract/integration` compiles the file with esbuild
3. A Bun-compatible VM evaluates the compiled code to extract CSS
4. CSS is served as virtual modules and emitted alongside JS
5. JS output only contains exported class name strings (zero runtime)

## Example

```ts
// styles.css.ts
import { style, createTheme } from '@vanilla-extract/css';

export const container = style({
  display: 'flex',
  padding: 24,
});

export const button = style({
  backgroundColor: '#0070f3',
  color: 'white',
  borderRadius: 8,
  padding: '12px 24px',
  ':hover': {
    backgroundColor: '#0051a2',
  },
});

export const [themeClass, vars] = createTheme({
  color: { primary: '#764abc' },
  spacing: { medium: '16px' },
});
```

```ts
// app.ts
import { container, button, themeClass } from './styles.css.ts';

document.body.innerHTML = `
  <div class="${container}">
    <button class="${button}">Click me</button>
  </div>
`;
```

Build output:
- `dist/app.js` — ~800 bytes (just class name strings)
- `dist/app.css` — ~900 bytes (static CSS with scoped class names + CSS variables)

## API

### `vanillaExtractPlugin(options?)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `identOption` | `'short' \| 'debug'` | `'short'` (prod) | Class name identifier style |
| `esbuildOptions` | `object` | — | Options passed to internal esbuild compile step |
| `emitCss` | `boolean` | `false` | Write CSS files to filesystem |
| `emitSingleCss` | `boolean` | `false` | Combine all CSS into a single file |
| `cssFileName` | `string` | `'vanilla.css'` | Name of single combined CSS file |
| `cssOutDir` | `string` | Bun's outdir | Output directory for CSS files |

### Exports

```ts
export { vanillaExtractPlugin, cssFileFilter, compile } from '@audinue/bun-plugin-vanilla-extract';
```

## License

MIT

---

Made by [DeepSeek v4 Pro](https://deepseek.ai)
