/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
	forbidden: [
		// ---- Layer boundaries (presentation -> business -> data, one direction) ----
		// eslint's no-restricted-imports only matches the `$lib/...` specifier
		// strings; these also catch relative imports and dynamic `import()`.
		{
			name: 'data-not-to-upper-layers',
			severity: 'error',
			comment:
				'The data layer must not import from the business or presentation layers. Whatever a ' +
				'read needs in order to be interpreted is passed in as a parameter (AGENTS.md R1).',
			from: { path: '^src/lib/data' },
			to: { path: '^src/lib/(business|presentation)' }
		},
		{
			name: 'business-not-to-presentation',
			severity: 'error',
			comment:
				'The business layer must not import from the presentation layer, not even with ' +
				'`import type` (AGENTS.md R1). Business declares the config schema itself, in ' +
				'business/model/config.ts, rather than deriving it from component props -- that is ' +
				'what keeps the config file a contract instead of a side effect of a refactor.',
			from: { path: '^src/lib/business' },
			to: { path: '^src/lib/presentation' }
		},
		{
			name: 'presentation-not-to-data',
			severity: 'error',
			comment:
				'Presentation code (and the app shell: routes, hooks, service worker) must go through ' +
				'the business layer -- stores in $lib/business/store, types via $lib/business/type ' +
				'(AGENTS.md R1). Note this binds the SERVER files too: a load function is the ' +
				'composition root, not a licence to reach the repository.',
			from: { path: '^src/(lib/presentation|routes|hooks|service-worker)' },
			to: { path: '^src/lib/data' }
		},
		{
			name: 'presentation-not-to-business-model',
			severity: 'error',
			comment:
				'Reads end at a store. A route or component may use $lib/business/store; calling a ' +
				'model directly puts orchestration in a file no *.spec.ts can reach (AGENTS.md R2). ' +
				'`import type` is fine -- it is how a component types its props.',
			from: {
				// Server files are the composition root; specs and stories build their own
				// fixtures and are not the drift this rule is about.
				path: '^src/(lib/presentation/|routes/)',
				pathNot: [
					'[.]server[.]ts$',
					'(^|/)\\+server[.]ts$',
					'[.](?:spec|test)[.](?:js|ts)$',
					'[.]stories[.]svelte$'
				]
			},
			to: {
				path: '^src/lib/business/model/',
				dependencyTypesNot: ['type-only']
			}
		},
		{
			name: 'leaf-not-to-upper-layers',
			// Not in the zenith rule set, which has no lib/utils. This repo does, so it
			// needs saying: utils is the shared leaf precisely because it imports nothing
			// internal, which is what lets both business and presentation use it.
			severity: 'error',
			comment:
				'src/lib/utils is the shared leaf: pure helpers with no idea what the app does. A ' +
				'dependency on a layer turns a helper into a layer and gives it a second reason to ' +
				'change -- take the value as an argument instead. If a helper genuinely belongs to ' +
				'one layer, move it there rather than importing upward from here.',
			from: {
				path: '^src/lib/utils/',
				pathNot: '[.](?:spec|test)[.](?:js|ts)$'
			},
			to: {
				path: '^src/(lib/(data|business|presentation)/|routes/)',
				dependencyTypesNot: ['type-only']
			}
		},
		{
			name: 'no-circular',
			// Kept at warn: config-container <-> grid <-> sub-grid is a real cycle and a
			// deliberate one -- config containers nest, so the renderer has to recurse.
			// Any NEW cycle outside that trio is worth a look.
			severity: 'warn',
			comment:
				'This dependency is part of a circular relationship. You might want to revise ' +
				'your solution (i.e. use dependency inversion, make sure the modules have a single responsibility) ',
			from: {},
			to: {
				circular: true
			}
		},
		{
			name: 'no-orphans',
			comment:
				"This is an orphan module - it's likely not used (anymore?). Either use it or " +
				"remove it. If it's logical this module is an orphan (i.e. it's a config file), " +
				'add an exception for it in your dependency-cruiser configuration. By default ' +
				'this rule does not scrutinize dot-files (e.g. .eslintrc.js), TypeScript declaration ' +
				'files (.d.ts), tsconfig.json and some of the babel and webpack configs.',
			severity: 'warn',
			from: {
				orphan: true,
				pathNot: [
					'^src/lib/paraglide/', // generated i18n files
					// type-only modules: `import type` inside .svelte files is stripped by the
					// svelte compiler before dependency-cruiser sees it, so these look like
					// orphans even when components use them
					'^src/lib/business/type/',
					'(^|/)[.][^/]+[.](?:js|cjs|mjs|ts|cts|mts|json)$', // dot files
					'[.]d[.]ts$', // TypeScript declaration files
					'(^|/)tsconfig[.]json$', // TypeScript config
					'(^|/)(?:babel|webpack)[.]config[.](?:js|cjs|mjs|ts|cts|mts|json)$' // other configs
				]
			},
			to: {}
		},
		{
			name: 'no-deprecated-core',
			comment:
				'A module depends on a node core module that has been deprecated. Find an alternative - these are ' +
				"bound to exist - node doesn't deprecate lightly.",
			severity: 'warn',
			from: {
				// generated paraglide code uses async_hooks for AsyncLocalStorage, which is
				// stable - only the original hooks API in that module is deprecated
				pathNot: ['^src/lib/paraglide/']
			},
			to: {
				dependencyTypes: ['core'],
				path: [
					'^v8/tools/codemap$',
					'^v8/tools/consarray$',
					'^v8/tools/csvparser$',
					'^v8/tools/logreader$',
					'^v8/tools/profile_view$',
					'^v8/tools/profile$',
					'^v8/tools/SourceMap$',
					'^v8/tools/splaytree$',
					'^v8/tools/tickprocessor-driver$',
					'^v8/tools/tickprocessor$',
					'^node-inspect/lib/_inspect$',
					'^node-inspect/lib/internal/inspect_client$',
					'^node-inspect/lib/internal/inspect_repl$',
					'^async_hooks$',
					'^punycode$',
					'^domain$',
					'^constants$',
					'^sys$',
					'^_linklist$',
					'^_stream_wrap$'
				]
			}
		},
		{
			name: 'not-to-deprecated',
			comment:
				'This module uses a (version of an) npm module that has been deprecated. Either upgrade to a later ' +
				'version of that module, or find an alternative. Deprecated modules are a security risk.',
			severity: 'warn',
			from: {},
			to: {
				dependencyTypes: ['deprecated']
			}
		},
		{
			name: 'no-non-package-json',
			severity: 'error',
			comment:
				"This module depends on an npm package that isn't in the 'dependencies' section of your package.json. " +
				"That's problematic as the package either (1) won't be available on live (2 - worse) will be " +
				'available on live with an non-guaranteed version. Fix it by adding the package to the dependencies ' +
				'in your package.json.',
			from: {},
			to: {
				dependencyTypes: ['npm-no-pkg', 'npm-unknown']
			}
		},
		{
			name: 'not-to-unresolvable',
			comment:
				"This module depends on a module that cannot be found ('resolved to disk'). If it's an npm " +
				'module: add it to your package.json. In all other cases you likely already know what to do.',
			severity: 'error',
			from: {},
			to: {
				couldNotResolve: true,
				// SvelteKit virtual modules and generated route types only exist at build time
				pathNot: ['^\\$app/', '^\\$env/', '^\\$service-worker$', '(^|/)\\$types$']
			}
		},
		{
			name: 'no-duplicate-dep-types',
			comment:
				"Likely this module depends on an external ('npm') package that occurs more than once " +
				'in your package.json i.e. bot as a devDependencies and in dependencies. This will cause ' +
				'maintenance problems later on.',
			severity: 'warn',
			from: {},
			to: {
				moreThanOneDependencyType: true,
				// as it's common to use a devDependency for type-only imports: don't
				// consider type-only dependencyTypes for this rule
				dependencyTypesNot: ['type-only']
			}
		},
		{
			name: 'not-to-spec',
			comment:
				'This module depends on a spec (test) file. The responsibility of a spec file is to test code. ' +
				"If there's something in a spec that's of use to other modules, it doesn't have that single " +
				'responsibility anymore. Factor it out into (e.g.) a separate utility/ helper or a mock.',
			severity: 'error',
			from: {},
			to: {
				path: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$'
			}
		},
		{
			name: 'not-to-dev-dep',
			// SvelteKit keeps every build-time dependency in devDependencies (Vite bundles
			// them), so this rule is all false positives here -- every `svelte` and
			// `@sveltejs/kit` import would be flagged.
			severity: 'ignore',
			comment:
				"This module depends on an npm package from the 'devDependencies' section of your " +
				'package.json. It looks like something that ships to production, though. To prevent problems ' +
				"with npm packages that aren't there on production declare it (only!) in the 'dependencies'" +
				'section of your package.json. If this module is development only - add it to the ' +
				'from.pathNot re of the not-to-dev-dep rule in the dependency-cruiser configuration',
			from: {
				path: '^(src)',
				pathNot: '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$'
			},
			to: {
				dependencyTypes: ['npm-dev'],
				// type only dependencies are not a problem as they don't end up in the
				// production code or are ignored by the runtime.
				dependencyTypesNot: ['type-only'],
				pathNot: ['node_modules/@types/']
			}
		},
		{
			name: 'optional-deps-used',
			severity: 'info',
			comment:
				'This module depends on an npm package that is declared as an optional dependency ' +
				"in your package.json. As this makes sense in limited situations only, it's flagged here. " +
				'If you use an optional dependency here by design - add an exception to your' +
				'dependency-cruiser configuration.',
			from: {},
			to: {
				dependencyTypes: ['npm-optional']
			}
		},
		{
			name: 'peer-deps-used',
			comment:
				'This module depends on an npm package that is declared as a peer dependency ' +
				'in your package.json. This makes sense if your package is e.g. a plugin, but in ' +
				'other cases - maybe not so much. If the use of a peer dependency is intentional ' +
				'add an exception to your dependency-cruiser configuration.',
			severity: 'warn',
			from: {},
			to: {
				dependencyTypes: ['npm-peer']
			}
		}
	],
	options: {
		doNotFollow: {
			path: ['node_modules']
		},

		exclude: {
			// generated paraglide message functions - hundreds of files, no insight
			path: ['^src/lib/paraglide/messages']
		},

		detectProcessBuiltinModuleCalls: true,

		// `import type` is erased before the bundler sees it -- and it is exactly what
		// separates a legal type reference across layers from an illegal value import,
		// so the layer rules need these detected.
		tsPreCompilationDeps: true,

		// Resolves `$lib`. The app's own tsconfig.json can't be used here: it delegates
		// aliases to svelte.config.js and inherits them via .svelte-kit/tsconfig.json,
		// whose relative `include` paths only resolve from inside .svelte-kit. See the
		// comment in tsconfig.depcruise.json.
		tsConfig: {
			fileName: 'tsconfig.depcruise.json'
		},

		enhancedResolveOptions: {
			exportsFields: ['exports'],
			// 'svelte' and 'browser' are needed on top of the defaults so imports of
			// svelte itself resolve to real files instead of showing up unresolvable.
			conditionNames: ['import', 'require', 'node', 'default', 'types', 'svelte', 'browser'],
			mainFields: ['module', 'main', 'types', 'typings']
		},

		skipAnalysisNotInRules: true,

		reporterOptions: {
			dot: {
				// Collapse node_modules one folder deep, and fold the generated paraglide
				// output into a single node, so the graph shows this app's own structure.
				collapsePattern: 'node_modules/(?:@[^/]+/[^/]+|[^/]+)|^src/lib/paraglide'
			},
			archi: {
				collapsePattern:
					'^(?:packages|src|lib(s?)|app(s?)|bin|test(s?)|spec(s?))/[^/]+|node_modules/(?:@[^/]+/[^/]+|[^/]+)'
			},
			text: {
				highlightFocused: true
			}
		}
	}
};
