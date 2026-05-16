import { vanillaExtractPlugin } from '../dist/index.js';

const result = await Bun.build({
  entrypoints: ['./src/app.ts'],
  outdir: './dist-emit',
  plugins: [
    vanillaExtractPlugin({
      identOption: 'short',
      emitCss: true,
      emitSingleCss: true,
      cssFileName: 'bundle.css',
    }),
  ],
});

console.log('Success:', result.success);

if (!result.success) {
  for (const log of result.logs) {
    console.error('BUILD ERROR:', JSON.stringify(log));
  }
  process.exit(1);
}

for (const output of result.outputs) {
  console.log('Output:', output.path, `(${output.size} bytes)`);
}

// Check if CSS file was written to disk
import { readFileSync } from 'fs';
import { join } from 'path';
const cssPath = join(process.cwd(), 'dist-emit', 'bundle.css');
try {
  const css = readFileSync(cssPath, 'utf-8');
  console.log('\nEmitted CSS file found!');
  console.log(css.slice(0, 500));
} catch {
  console.log('\nNo emitted CSS file found');
}
