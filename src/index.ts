import type { BunPlugin } from 'bun';
import {
  compile,
  transform,
  getPackageInfo,
  cssFileFilter,
} from '@vanilla-extract/integration';
import { bunProcessVanillaFile } from './bun-process-vanilla';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const CSS_NAMESPACE = 'vanilla-extract-css';
const CSS_SCHEME = 've-css:';

interface VanillaExtractPluginOptions {
  identOption?: 'short' | 'debug';
  esbuildOptions?: Record<string, unknown>;
  emitCss?: boolean;
  cssOutDir?: string;
  emitSingleCss?: boolean;
  cssFileName?: string;
}

export function vanillaExtractPlugin(options?: VanillaExtractPluginOptions): BunPlugin {
  const {
    identOption = process.env.NODE_ENV === 'production' ? 'short' : 'debug',
    esbuildOptions,
    emitCss = false,
    cssOutDir,
    emitSingleCss = false,
    cssFileName = 'vanilla.css',
  } = options ?? {};

  const cssByVirtualPath = new Map<string, string>();

  return {
    name: 'vanilla-extract',
    async setup(build) {
      const rootDir = build.config.root ?? process.cwd();
      const outDir = cssOutDir ?? build.config.outdir ?? join(rootDir, 'dist');

      build.onStart(() => {
        cssByVirtualPath.clear();
      });

      build.onResolve(
        { filter: new RegExp(`^${CSS_SCHEME.replace(':', '\\:')}`) },
        (args) => ({
          path: args.path,
          namespace: CSS_NAMESPACE,
        }),
      );

      build.onLoad({ filter: /.*/, namespace: CSS_NAMESPACE }, (args) => {
        const css = cssByVirtualPath.get(args.path);
        if (css != null) {
          return { contents: css, loader: 'css' };
        }
        return undefined;
      });

      build.onLoad({ filter: cssFileFilter }, async (args) => {
        try {
          const { source, watchFiles } = await compile({
            filePath: args.path,
            identOption,
            cwd: rootDir,
            esbuildOptions: esbuildOptions as any,
          });

          const result = await bunProcessVanillaFile({
            source,
            filePath: args.path,
            outputCss: true,
            identOption,
            serializeVirtualCssPath: ({ fileScope, source: cssSource }) => {
              const virtualPath = `${CSS_SCHEME}${fileScope.filePath}$$${fileScope.packageName ?? ''}`;
              cssByVirtualPath.set(virtualPath, cssSource);
              return `import '${virtualPath}';`;
            },
          });

          return {
            contents: result,
            loader: 'js',
            watchFiles,
          };
        } catch (err) {
          console.error(
            `[vanilla-extract] Failed to compile ${args.path}:`,
            (err as Error).message ?? err,
          );
          // Fallback: transform with file scope and let Bun handle it
          try {
            const originalSource = readFileSync(args.path, 'utf-8');
            const packageInfo = getPackageInfo(rootDir);
            const transformed = await transform({
              source: originalSource,
              filePath: args.path,
              rootPath: rootDir,
              packageName: packageInfo.name,
              identOption,
            });

            return {
              contents: transformed,
              loader: args.path.match(/\.(ts|tsx)$/i) ? 'ts' : 'js',
              resolveDir: dirname(args.path),
            };
          } catch {
            const originalSource = readFileSync(args.path, 'utf-8');
            return {
              contents: originalSource,
              loader: args.path.match(/\.(ts|tsx)$/i) ? 'ts' : 'js',
              resolveDir: dirname(args.path),
            };
          }
        }
      });

      if (emitCss) {
        build.onEnd(async () => {
          if (cssByVirtualPath.size === 0) return;

          if (!existsSync(outDir)) {
            mkdirSync(outDir, { recursive: true });
          }

          if (emitSingleCss) {
            const allCss: string[] = [];
            for (const [, css] of cssByVirtualPath) {
              allCss.push(css);
            }
            writeFileSync(join(outDir, cssFileName), allCss.join('\n'), 'utf-8');
          } else {
            for (const [virtualPath, css] of cssByVirtualPath) {
              const cleanPath = virtualPath.replace(CSS_SCHEME, '');
              const sourcePath = cleanPath.split('$$')[0] ?? virtualPath;
              const rel = relative(rootDir, sourcePath);
              const cssOut = join(
                outDir,
                rel.replace(/\.css\.(ts|tsx|js|jsx|mjs|cjs)$/, '.vanilla.css'),
              );

              const cssDir = dirname(cssOut);
              if (!existsSync(cssDir)) {
                mkdirSync(cssDir, { recursive: true });
              }

              writeFileSync(cssOut, css, 'utf-8');
            }
          }
        });
      }
    },
  };
}

export { cssFileFilter, compile } from '@vanilla-extract/integration';
export { bunProcessVanillaFile } from './bun-process-vanilla';

export default vanillaExtractPlugin();
