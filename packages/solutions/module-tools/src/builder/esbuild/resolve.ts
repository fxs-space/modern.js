import fs from 'fs';
import { CachedInputFileSystem, create } from 'enhanced-resolve';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import { ImportKind, Platform } from 'esbuild';

/**
 * supports require js plugin in less file
 */
export const cssExtensions = ['.less', '.css', '.sass', '.scss', '.js'];

function createEnhancedResolve(options: ResolverOptions): {
  resolveSync: (dir: string, id: string) => string | false;
  esmResolveSync: (dir: string, id: string) => string | false;
} {
  const plugins = [];
  const { tsconfig } = options;

  // tsconfig-paths directly statSync `tsconfig.json` without confirm it's exist.
  if (fs.existsSync(tsconfig)) {
    plugins.push(
      new TsconfigPathsPlugin({
        baseUrl: options.root,
        configFile: tsconfig,
      }),
    );
  }
  const resolveOptions = {
    aliasFields: options.platform === 'browser' ? ['browser'] : [],
    FileSystem: new CachedInputFileSystem(fs, 4000),
    mainFields: options.mainFields,
    mainFiles: ['index'],
    extensions: options.extensions,
    preferRelative: options.preferRelative,
    addMatchAll: false,
    plugins,
    alias: options.alias,
  };

  // conditionNames follow webpack options
  // cjs
  const resolveSync = (dir: string, id: string) =>
    create.sync({
      ...resolveOptions,
      conditionNames: [options.platform, 'require', 'module'],
    })(dir, id);

  const esmResolveSync = (dir: string, id: string) =>
    create.sync({
      ...resolveOptions,
      conditionNames: [options.platform, 'import', 'module'],
    })(dir, id);

  return {
    resolveSync,
    esmResolveSync,
  };
}

export const createResolver = (options: ResolverOptions) => {
  const resolveCache = new Map<string, string>();
  const { resolveSync, esmResolveSync } = createEnhancedResolve(options);
  const resolver = (id: string, dir: string, kind?: ImportKind) => {
    const cacheKey = id + dir + (kind || '');
    const cacheResult = resolveCache.get(cacheKey);

    if (cacheResult) {
      return cacheResult;
    }
    let result: string | false;
    if (options.resolveType === 'js') {
      if (kind === 'import-statement' || kind === 'dynamic-import') {
        result = esmResolveSync(dir, id);
      } else {
        result = resolveSync(dir, id);
      }
    } else {
      try {
        result = resolveSync(dir, id);
      } catch (err) {
        result = resolveSync(dir, id.replace(/^~/, ''));
      }
    }
    if (!result) {
      throw new Error(`can not resolve ${id} from ${dir}`);
    }
    resolveCache.set(cacheKey, result);
    return result;
  };
  return resolver;
};

interface ResolverOptions {
  platform: Platform;
  resolveType: 'js' | 'css';
  extensions: string[];
  root: string;
  alias: Record<string, string>;
  tsconfig: string;
  mainFields: string[];
  preferRelative?: boolean;
}
