import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import { tamaguiPlugin } from '@tamagui/vite-plugin'
import { one } from 'one/vite'
import { visualizer } from 'rollup-plugin-visualizer'

import type { Plugin, UserConfig } from 'vite'
import { createLogger } from 'vite'

const rootDir = import.meta.dirname

function solanaBrowserAliases(): Record<string, string> {
  const solanaDir = resolve(rootDir, 'node_modules/@solana')
  if (!existsSync(solanaDir)) return {}

  const aliases: Record<string, string> = {}
  for (const pkg of readdirSync(solanaDir)) {
    const browserEntry = resolve(solanaDir, pkg, 'dist/index.browser.mjs')
    if (existsSync(browserEntry)) {
      aliases[`@solana/${pkg}`] = browserEntry
    }
  }
  return aliases
}

const solanaAliases = solanaBrowserAliases()
const solanaPackages = Object.keys(solanaAliases)

const eventemitter3 = resolve(
  rootDir,
  'node_modules/eventemitter3/dist/eventemitter3.esm.js',
)
const rpcWebsocketsBrowser = resolve(
  rootDir,
  'node_modules/rpc-websockets/dist/index.browser.mjs',
)

const crossmintReactUi = resolve(
  rootDir,
  'node_modules/@crossmint/client-sdk-react-ui/dist/index.js',
)
const crossmintReactBase = resolve(
  rootDir,
  'node_modules/@crossmint/client-sdk-react-base/dist/index.js',
)

const crossmintImportAliases = {
  '@crossmint/client-sdk-react-ui/import': crossmintReactUi,
  '@crossmint/client-sdk-react-base/import': crossmintReactBase,
} as const

const walletOptimizeDepsExclude = [
  // vxrn misreads package.json "import" export conditions as subpaths.
  '@crossmint/client-sdk-react-ui/import',
  '@crossmint/client-sdk-react-base/import',
  ...solanaPackages,
] as const

const walletOptimizeDepsInclude = [
  'buffer',
  'eventemitter3',
  'fflate',
  'wagmi',
  '@wagmi/core',
  '@wagmi/connectors',
  'viem',
  'mipd',
  'zustand',
] as const

const ssrWalletExternal = [
  '@wagmi/connectors',
  '@wagmi/core',
  'viem',
  'wagmi',
  ...solanaPackages,
] as const

const walletResolveAliases = {
  'rpc-websockets': rpcWebsocketsBrowser,
  eventemitter3,
  ...crossmintImportAliases,
  ...solanaAliases,
}

function bufferResolvePlugin(): Plugin {
  return {
    name: 'buffer-resolve',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source !== 'buffer/index.js') return null
      return (await this.resolve('buffer', importer, { skipSelf: true }))?.id ?? null
    },
  }
}

function solanaBrowserResolvePlugin(): Plugin {
  return {
    name: 'solana-browser-resolve',
    enforce: 'pre',
    resolveId(source) {
      const alias = solanaAliases[source]
      return alias ?? null
    },
  }
}

function createViteLogger() {
  const logger = createLogger()
  const warn = logger.warn.bind(logger)
  logger.warn = (msg, options) => {
    if (
      typeof msg === 'string' &&
      msg.includes('Sourcemap for') &&
      msg.includes('points to missing source files')
    ) {
      return
    }
    warn(msg, options)
  }
  return logger
}

export default {
  customLogger: createViteLogger(),
  server: {
    allowedHosts: ['host.docker.internal'],
  },

  resolve: {
    // Prefer jose's browser build — default "import" resolves to node/esm and crashes in the client.
    conditions: ['browser', 'import', 'module', 'default'],
    alias: {
      jose: resolve(rootDir, 'node_modules/jose/dist/browser/index.js'),
      '@atproto/common-web': resolve(
        rootDir,
        'node_modules/@atproto/common-web/dist/index.js',
      ),
      // vxrn-web resolve conditions don't match these package export maps.
      ...walletResolveAliases,
    },
  },

  optimizeDeps: {
    include: ['async-retry', '@creaton/forum-core', '@atproto/common-web', ...walletOptimizeDepsInclude],
    exclude: ['oxc-parser', 'jose', ...walletOptimizeDepsExclude],
    rolldownOptions: {
      resolve: {
        conditionNames: ['browser', 'import', 'module', 'default'],
        alias: walletResolveAliases,
      },
    },
  },

  ssr: {
    // we set this as it generally improves compatability by optimizing all deps for node
    noExternal: true,
    // @rocicorp/zero must be external to prevent Symbol mismatch between
    // @rocicorp/zero and @rocicorp/zero/server - they share queryInternalsTag
    // Symbol that must be the same instance for query transforms to work
    external: [
      '@vxrn/mdx',
      'retext',
      'retext-smartypants',
      '@opentelemetry/api',
      '@opentelemetry/semantic-conventions',
      '@opentelemetry/sdk-trace-base',
      '@opentelemetry/sdk-trace-node',
      '@opentelemetry/core',
      '@opentelemetry/resources',
      '@opentelemetry/sdk-node',
      ...ssrWalletExternal,
    ],
  },

  plugins: [
    bufferResolvePlugin(),
    solanaBrowserResolvePlugin(),

    tamaguiPlugin(
      // see tamagui.build.ts for configuration
    ),

    one({
      setupFile: {
        client: './src/setupClient.ts',
        native: './src/setupNative.ts',
        server: './src/setupServer.ts',
      },

      react: {
        compiler: process.env.NODE_ENV === 'production',
      },

      native: {
        bundler: 'rolldown',
      },

      router: {
        experimental: {
          typedRoutesGeneration: 'runtime',
        },
      },

      web: {
        experimental_scriptLoading: 'after-lcp-aggressive',
        inlineLayoutCSS: true,
        defaultRenderMode: 'spa',
        sitemap: {
          priority: 0.5,
          changefreq: 'weekly',
          exclude: [
            '/login/**',
            '/signup/**',
            '/profile-setup',
            '/avatar-setup',
            '/settings/**',
          ],
        },
      },

      build: {
        api: {
          config: {
            build: {
              rollupOptions: {
                external: ['sharp'],
              },
            },
          },
        },
      },
    }),

    ...(process.env.ANALYZE
      ? [
          visualizer({
            filename: 'bundle_stats.html',
            open: false,
            gzipSize: true,
            brotliSize: true,
            emitFile: true,
          }),
          visualizer({
            filename: 'bundle_stats.json',
            template: 'raw-data',
            gzipSize: true,
            brotliSize: true,
            emitFile: true,
          }),
        ]
      : []),
  ],
} satisfies UserConfig
