// The Persian messages the API answers with follow one style: a full sentence that ends with a full stop (or ! / ؟)
// and Persian digits for numbers. This test reads the source, so a new message that breaks the style fails here even
// before an integration test reaches it. (The integration tests check every message they receive the same way.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { faDigits } from '../../src/lib/text.js';
import { messageStyleProblem } from '../message-style.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
// startup and console messages (config.ts, server.ts) are for whoever runs the server, with commands and .env values
const SKIP = new Set(['config.ts', 'server.ts', 'paths.ts']);
const PERSIAN = /[؀-ۿ]/;
const LITERAL = /'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;
// a line that answers a client: an error / message field, a thrown HttpError, a survey answer check
const MESSAGE_LINE = /message|error:|HttpError\(|fail\(|LIMIT_MESSAGE =|THANKS =|LAST_DEVELOPER =/;

function sourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return sourceFiles(full);
		return entry.name.endsWith('.ts') && !SKIP.has(entry.name) ? [full] : [];
	});
}

test('faDigits writes numbers with Persian digits', () => {
	assert.equal(faDigits(1200), '۱۲۰۰');
	assert.equal(faDigits('limit 200'), 'limit ۲۰۰');
});

test('the style rule itself', () => {
	assert.equal(messageStyleProblem('بنر پیدا نشد.'), null);
	assert.equal(messageStyleProblem('ممنون که نظرت را گفتی!'), null);
	assert.equal(messageStyleProblem('«بنر 2» از قبل وجود دارد.'), null, 'quoted user text may contain any digits');
	assert.match(messageStyleProblem('بنر پیدا نشد') ?? '', /end/);
	assert.match(messageStyleProblem('حداکثر 10 بنر فعال مجاز است.') ?? '', /digit/);
});

test('every Persian message in the source ends a sentence and has no Latin digits', () => {
	const problems: string[] = [];
	for (const file of sourceFiles(SRC)) {
		fs.readFileSync(file, 'utf8')
			.split('\n')
			.forEach((line, index) => {
				if (!MESSAGE_LINE.test(line) || /console\./.test(line) || /^\s*(\/\/|\*)/.test(line)) return;
				for (const [literal] of line.matchAll(LITERAL)) {
					if (!PERSIAN.test(literal)) continue;
					// interpolations are checked at run time; here only the fixed text counts
					const text = literal.slice(1, -1).replace(/\$\{[^}]*\}/g, '«x»');
					const problem = messageStyleProblem(text);
					if (problem) problems.push(`${path.relative(SRC, file)}:${index + 1}: ${problem}: ${literal}`);
				}
			});
	}
	assert.deepEqual(problems, []);
});
