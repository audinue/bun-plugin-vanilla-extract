import { vanillaExtractPlugin } from '../dist/index.js';

const result = await Bun.build({
  entrypoints: ['./src/app.ts'],
  outdir: './dist',
  plugins: [vanillaExtractPlugin({ identOption: 'debug' })],
});

console.log('Success:', result.success);

for (const log of result.logs) {
  console.log('LOG:', JSON.stringify(log, null, 2));
}

if (!result.success) {
  process.exit(1);
}

for (const output of result.outputs) {
  console.log('Output:', output.path, `(${output.size} bytes)`);
  if (output.path.endsWith('.css')) {
    const text = await output.text();
    console.log('CSS preview:', text.slice(0, 500));
  }
}
