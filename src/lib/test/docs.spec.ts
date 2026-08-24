import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/**
 * The doc-drift fence: a refactor once left three AGENTS.md links 404ing while
 * prettier --check and depcruise both stayed green. This reads the four
 * top-level docs as shipped, so paths resolve off the spec's own location.
 */
const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const DOCS = ['AGENTS.md', 'README.md', 'roadmap.md', 'CLAUDE.md'];

interface LinkTarget {
	doc: string;
	raw: string;
	path: string;
	anchor: string;
}

/** Links inside code spans and fences are literal text, not rendered links — one of them is this fence's own `](relative/path)` example. */
function stripMarkdownCode(markdown: string): string {
	return markdown.replace(/^[ \t]*```[^\n]*\n[\s\S]*?\n[ \t]*```/gm, '').replace(/`[^`\n]*`/g, '');
}

function linkTargets(doc: string): LinkTarget[] {
	const targets: LinkTarget[] = [];

	for (const [, raw] of stripMarkdownCode(readFileSync(join(ROOT, doc), 'utf8')).matchAll(
		/\]\(([^)\s]+)\)/g,
	)) {
		const [path = '', anchor = ''] = raw.split('#');

		/* Fragment-only anchors stay within their own page; a scheme is not a file; and paths leaving the repo (roadmap's ../zenith) name a sibling checkout that CI has not cloned. */
		if (!path || path.startsWith('/') || /^\w+:/.test(path) || path.split('/').includes('..')) {
			continue;
		}

		targets.push({
			doc,
			raw,
			path,
			anchor,
		});
	}

	return targets;
}

function lineCount(pathAbsolute: string): number {
	const lines = readFileSync(pathAbsolute, 'utf8').split('\n');

	if (lines.at(-1) === '') {
		lines.pop();
	}

	return lines.length;
}

it('every relative markdown link resolves to a file in this repo', () => {
	const missing = DOCS.flatMap((doc) => linkTargets(doc))
		.filter(({ path }) => !existsSync(join(ROOT, path)))
		.map(({ doc, raw }) => `${doc} -> ${raw}`);

	expect(missing).toEqual([]);
});

it('every #L<n> anchor points inside its target file', () => {
	const outOfRange: string[] = [];

	for (const target of DOCS.flatMap((doc) => linkTargets(doc))) {
		if (!/^L\d+(-L\d+)?$/.test(target.anchor)) {
			continue;
		}

		const lines = lineCount(join(ROOT, target.path));

		for (const [, wanted] of target.anchor.matchAll(/L(\d+)/g)) {
			const lineNumber = Number(wanted);

			if (lineNumber < 1 || lineNumber > lines) {
				outOfRange.push(`${target.doc} -> ${target.raw} (${lines} lines)`);
			}
		}
	}

	expect(outOfRange).toEqual([]);
});
