import vm from 'node:vm';
import { createRequire } from 'node:module';
import { stringifyFileScope, parseFileScope, hash } from '@vanilla-extract/integration';
import { setAdapter, removeAdapter } from '@vanilla-extract/css/adapter';
import { transformCss } from '@vanilla-extract/css/transformCss';
import jsStringify from 'javascript-stringify';

// ---- Replicated from @vanilla-extract/integration (not exported) ----

function isPlainObject(value: unknown) {
  if (typeof value !== 'object' || value === null) return false;
  if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype === null) return true;
  const constructor =
    Object.prototype.hasOwnProperty.call(prototype, 'constructor') &&
    prototype.constructor;
  return (
    typeof constructor === 'function' &&
    constructor instanceof constructor &&
    Function.prototype.call(constructor) === Function.prototype.call(value)
  );
}

const DEFAULT_EXPORT_NAME = '__default__';

class DependencyGraph {
  graph = new Map<string, Set<string>>();

  addDependency(key: string, dependency: string) {
    const deps = this.graph.get(key);
    if (deps) {
      deps.add(dependency);
    } else {
      this.graph.set(key, new Set([dependency]));
    }
  }

  dependsOn(key: string, dependency: string): boolean {
    const deps = this.graph.get(key);
    if (deps) {
      if (deps.has(dependency)) return true;
      for (const [dep] of deps.entries()) {
        if (this.dependsOn(dep, dependency)) return true;
      }
    }
    return false;
  }
}

function stringifyExports(
  functionSerializationImports: Set<string>,
  value: any,
  unusedCompositionRegex: RegExp | null,
  key: string,
  exportLookup: Map<any, string>,
  exportDependencyGraph: DependencyGraph,
): any {
  return jsStringify.stringify(
    value,
    (value: any, _indent: any, next: any) => {
      const valueType = typeof value;

      if (
        valueType === 'boolean' ||
        valueType === 'number' ||
        valueType === 'undefined' ||
        value === null
      ) {
        return next(value);
      }

      if (Array.isArray(value) || isPlainObject(value)) {
        const reusedExport = exportLookup.get(value);
        if (reusedExport && reusedExport !== key) {
          exportDependencyGraph.addDependency(key, reusedExport);
          return reusedExport;
        }
        return next(value);
      }

      if (Symbol.toStringTag in Object(value)) {
        const { [Symbol.toStringTag]: _tag, ...valueWithoutTag } = value;
        return next(valueWithoutTag);
      }

      if (valueType === 'string') {
        return next(
          unusedCompositionRegex
            ? value.replace(unusedCompositionRegex, '')
            : value,
        );
      }

      if (
        valueType === 'function' &&
        (value.__function_serializer__ || value.__recipe__)
      ) {
        const { importPath, importName, args } =
          value.__function_serializer__ || value.__recipe__;

        if (
          typeof importPath !== 'string' ||
          typeof importName !== 'string' ||
          !Array.isArray(args)
        ) {
          throw new Error('Invalid function serialization params');
        }

        const hashedImportName = `_${hash(`${importName}${importPath}`).slice(0, 5)}`;
        functionSerializationImports.add(
          `import { ${importName} as ${hashedImportName} } from '${importPath}';`,
        );

        return `${hashedImportName}(${args
          .map((arg) =>
            stringifyExports(
              functionSerializationImports,
              arg,
              unusedCompositionRegex,
              key,
              exportLookup,
              exportDependencyGraph,
            ),
          )
          .join(',')})`;
      }

      throw new Error(
        'Invalid exports. You can only export plain objects, arrays, strings, numbers and null/undefined.',
      );
    },
    0,
    { references: true, maxDepth: Infinity, maxValues: Infinity },
  );
}

function serializeVanillaModule(
  cssImports: Array<string>,
  exports: Record<string, unknown>,
  unusedCompositionRegex: RegExp | null,
): string {
  const functionSerializationImports = new Set<string>();
  const exportLookup = new Map<any, string>(
    Object.entries(exports).map(([key, value]) => [
      value,
      key === 'default' ? DEFAULT_EXPORT_NAME : key,
    ]),
  );

  const exportDependencyGraph = new DependencyGraph();

  const moduleExports = Object.entries(exports).map(([key, value]) => {
    const serializedExport = stringifyExports(
      functionSerializationImports,
      value,
      unusedCompositionRegex,
      key === 'default' ? DEFAULT_EXPORT_NAME : key,
      exportLookup,
      exportDependencyGraph,
    );

    if (key === 'default') {
      return [
        DEFAULT_EXPORT_NAME,
        [
          `var ${DEFAULT_EXPORT_NAME} = ${serializedExport};`,
          `export default ${DEFAULT_EXPORT_NAME};`,
        ].join('\n'),
      ];
    }

    return [key, `export var ${key} = ${serializedExport};`];
  });

  const sortedModuleExports = moduleExports
    .sort(([key1], [key2]) => {
      if (exportDependencyGraph.dependsOn(key1, key2)) return 1;
      if (exportDependencyGraph.dependsOn(key2, key1)) return -1;
      return 0;
    })
    .map(([, s]) => s);

  return [
    ...cssImports,
    ...functionSerializationImports,
    ...sortedModuleExports,
  ].join('\n');
}

// ---- End replicated code ----

// ---- Type definitions ----

interface FileScope {
  filePath: string;
  packageName?: string;
}

interface AdapterCSSObject {
  type: 'local' | 'global' | 'theme';
  rule: Record<string, unknown>;
}

interface Composition {
  identifier: string;
  classList: string;
}

interface Adapter {
  appendCss(css: AdapterCSSObject, fileScope: FileScope): void;
  registerClassName(className: string): void;
  registerComposition(composition: Composition): void;
  markCompositionUsed(identifier: string): void;
  onEndFileScope(fileScope: FileScope): void;
  getIdentOption(): string;
}

// ---- Bun-compatible processVanillaFile ----

interface BunProcessVanillaFileOptions {
  source: string;
  filePath: string;
  outputCss?: boolean;
  identOption?: string;
  serializeVirtualCssPath?: (file: {
    fileName: string;
    fileScope: FileScope;
    source: string;
  }) => string | Promise<string>;
}

export async function bunProcessVanillaFile({
  source,
  filePath,
  outputCss = true,
  identOption = 'short',
  serializeVirtualCssPath,
}: BunProcessVanillaFileOptions): Promise<string> {
  const cssByFileScope = new Map<string, Array<AdapterCSSObject>>();
  const localClassNames = new Set<string>();
  const composedClassLists: Array<Composition> = [];
  const usedCompositions = new Set<string>();

  const cssAdapter: Adapter = {
    appendCss: (css, fileScope) => {
      if (outputCss) {
        const serialisedFileScope = stringifyFileScope(fileScope);
        const fileScopeCss = cssByFileScope.get(serialisedFileScope) ?? [];
        fileScopeCss.push(css);
        cssByFileScope.set(serialisedFileScope, fileScopeCss);
      }
    },
    registerClassName: (className) => {
      localClassNames.add(className);
    },
    registerComposition: (composedClassList) => {
      composedClassLists.push(composedClassList);
    },
    markCompositionUsed: (identifier) => {
      usedCompositions.add(identifier);
    },
    onEndFileScope: () => {},
    getIdentOption: () => identOption,
  };

  // Persist NODE_ENV to avoid Vite-style interference
  const currentNodeEnv = process.env.NODE_ENV;
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = originalNodeEnv;

  // Evaluate the compiled source in a Bun-compatible VM sandbox
  const adapterBoundSource = `
    require('@vanilla-extract/css/adapter').setAdapter(__adapter__);
    ${source}
  `;

  const req = createRequire(filePath);

  const vmSandbox = {
    console,
    process,
    require: req,
    module: { exports: {} },
    __adapter__: cssAdapter,
    __dirname: require('node:path').dirname(filePath),
    __filename: filePath,
    global: undefined as any,
    exports: {} as any,
  };
  vmSandbox.global = vmSandbox;
  vmSandbox.exports = vmSandbox.module.exports;

  const vmContext = vm.createContext(vmSandbox);

  try {
    const script = new vm.Script(adapterBoundSource, { filename: filePath });
    script.runInContext(vmContext, { breakOnSigint: true });
  } catch (err: any) {
    // Enhance error with file path for debugging
    const message = err?.message ?? String(err);
    throw new Error(`Error evaluating ${filePath}: ${message}`, { cause: err });
  }

  const evalResult = vmSandbox.module.exports as Record<string, unknown>;

  // Clean up adapter
  try {
    const cleanupCode = `
      const { removeAdapter } = require('@vanilla-extract/css/adapter');
      if (removeAdapter) removeAdapter();
    `;
    const cleanupScript = new vm.Script(cleanupCode, { filename: filePath });
    cleanupScript.runInContext(vmContext, { breakOnSigint: true });
  } catch {
    // Best effort cleanup
  }

  process.env.NODE_ENV = currentNodeEnv;

  // Process collected CSS
  const cssImports: string[] = [];

  for (const [serialisedFileScope, fileScopeCss] of cssByFileScope) {
    const fileScope = parseFileScope(serialisedFileScope);
    const css = transformCss({
      localClassNames: Array.from(localClassNames),
      composedClassLists,
      cssObjs: fileScopeCss as any,
    }).join('\n');

    const fileName = `${fileScope.filePath}.vanilla.css`;

    let virtualCssFilePath: string;

    if (serializeVirtualCssPath) {
      const serializedResult = serializeVirtualCssPath({
        fileName,
        fileScope,
        source: css,
      });

      if (typeof serializedResult === 'string') {
        virtualCssFilePath = serializedResult;
      } else {
        virtualCssFilePath = await serializedResult;
      }
    } else {
      // Default: encode CSS as URL param (compatible with virtualCssFileFilter)
      const { serializeCss } = await import('@vanilla-extract/integration');
      const serializedCss = await serializeCss(css);
      virtualCssFilePath = `import '${fileName}?source=${serializedCss}';`;
    }

    cssImports.push(virtualCssFilePath);
  }

  // Remove unused compositions from class names
  const unusedCompositions = composedClassLists
    .filter(({ identifier }) => !usedCompositions.has(identifier))
    .map(({ identifier }) => identifier);

  const unusedCompositionRegex =
    unusedCompositions.length > 0
      ? new RegExp(`(${unusedCompositions.join('|')})\\s`, 'g')
      : null;

  return serializeVanillaModule(cssImports, evalResult, unusedCompositionRegex);
}
