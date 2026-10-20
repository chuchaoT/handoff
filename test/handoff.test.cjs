const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '../handoff.cjs');
const titles = ['当前目标', '已完成', '改到一半的文件', '试过但失败的方案', '没跑通的测试或报错', '下一步具体做什么'];
const env = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_SYSTEM: os.devNull,
  GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
  GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.invalid',
  NO_COLOR: '1', GIT_OPTIONAL_LOCKS: '0' };
// Git fixture changes are intentional: these tests catch lost files, stale metadata,
// overwritten handoffs, and hooks that accidentally block real commits.
function run(cwd, program, args, options = {}) {
  const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  return { ...result, output: result.stdout + result.stderr };
}
function git(cwd, ...args) {
  const result = run(cwd, 'git', args);
  assert.equal(result.status, 0, result.output);
  return result.stdout.trim();
}
function repo(t, commit = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "handoff space ' "));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, 'init', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'base.txt'), 'one\ntwo\n');
  if (commit) { git(dir, 'add', '.'); git(dir, 'commit', '-m', 'initial subject'); }
  return dir;
}
function cli(dir, ...args) { return run(dir, process.execPath, [CLI, ...args]); }
function read(dir) { return fs.readFileSync(path.join(dir, 'HANDOFF.md'), 'utf8'); }
function section(md, n) {
  return md.split(`## ${n}. ${titles[n - 1]}\n`)[1]?.split(/^## /m)[0].trim();
}
function fill(dir, overrides = {}) {
  let md = read(dir);
  for (let n = 1; n <= 6; n++) {
    const body = overrides[n] ?? (n === 3 ? section(md, n) : `已核实：${titles[n - 1]}的具体事实。`);
    md = md.replace(new RegExp(`(## ${n}\\. ${titles[n - 1]}\\n)[\\s\\S]*?(?=^## |$(?![\\s\\S]))`, 'm'), `$1\n${body}\n\n`);
  }
  fs.writeFileSync(path.join(dir, 'HANDOFF.md'), md);
}

test('init creates six empty sections, metadata and commit subjects', t => {
  const dir = repo(t);
  const result = cli(dir, 'init');
  assert.equal(result.status, 0, result.output);
  const md = read(dir);
  for (let n = 1; n <= 6; n++) assert.equal(section(md, n).replace(/<!--[\s\S]*?-->/g, '').trim(), '');
  assert.match(md, /生成时间：\d{4}-\d\d-\d\dT/);
  assert.match(md, /当前分支：main/);
  assert.ok(md.includes(git(dir, 'rev-parse', 'HEAD')));
  assert.match(md, /initial subject/);
});

test('default generation matches git status including HANDOFF and exact tracked counts', t => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'base.txt'), 'one\nchanged\nextra\n');
  git(dir, 'add', 'base.txt');
  fs.appendFileSync(path.join(dir, 'base.txt'), 'unstaged\n');
  fs.writeFileSync(path.join(dir, 'new file.txt'), 'hello\nworld');
  const result = cli(dir);
  assert.equal(result.status, 1, result.output); // Required human-written sections still empty.
  const body = section(read(dir), 3);
  const files = git(dir, 'status', '--porcelain=v1', '-z', '--untracked-files=all').split('\0').filter(Boolean).map(s => s.slice(3));
  const listed = body.split('\n').filter(s => s.startsWith('- '));
  assert.equal(listed.length, files.length);
  for (const file of files) assert.ok(body.includes(JSON.stringify(file)), file);
  assert.match(body, /"base.txt": \+3 -1/);
  assert.match(body, /"new file.txt": \+2 -0/);
  const lineCount = read(dir).split('\n').length - 1;
  assert.ok(body.includes(`"HANDOFF.md": +${lineCount} -0`));
  assert.doesNotMatch(read(dir), /changed|unstaged|hello|world/);
});

test('large worktrees keep the entire list including remainder within ten lines', t => {
  const dir = repo(t);
  for (let n = 0; n < 14; n++) fs.writeFileSync(path.join(dir, `file-${n}.txt`), 'x\n');
  cli(dir);
  const body = section(read(dir), 3);
  assert.equal(body.split('\n').filter(s => s.startsWith('- ')).length, 9);
  assert.equal(body.split('\n').filter(s => s.trim()).length, 10);
  assert.match(body, /另有 6 个文件/);
});

test('check flags empty and placeholder sections with nonzero status and red output', t => {
  const dir = repo(t);
  cli(dir);
  fill(dir, { 4: '<!-- ignored comment -->\n- TODO\n待填写' });
  const before = read(dir);
  const result = run(dir, process.execPath, [CLI, 'check'], { env: { ...env, NO_COLOR: '', FORCE_COLOR: '1' } });
  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /\x1b\[31m缺：试过但失败的方案/);
  assert.equal(read(dir), before);
});

test('check accepts explicit none and all completed sections', t => {
  const dir = repo(t);
  cli(dir);
  fill(dir, { 4: '无，尚未尝试其他方案。', 5: '无；npm test 已全部通过。' });
  const result = cli(dir, 'check');
  assert.equal(result.status, 0, result.output);
});

test('parenthesized placeholders and empty fenced blocks still count as missing', t => {
  const dir = repo(t);
  cli(dir);
  fill(dir, { 1: '（待填写）', 4: '```text\n```', 5: '- [ ] TBD', 6: '【请填写下一步】' });
  const result = cli(dir, 'check');
  assert.equal(result.status, 1);
  for (const n of [1, 4, 5, 6]) assert.ok(result.output.includes(`缺：${titles[n - 1]}`), result.output);
});

test('check warns when dirty worktree has empty section three', t => {
  const dir = repo(t);
  cli(dir, 'init');
  fill(dir, { 3: '' });
  const result = cli(dir, 'check');
  assert.equal(result.status, 1);
  assert.match(result.output, /缺：改到一半的文件/);
});

test('new commit and branch changes make handoff stale', t => {
  const dir = repo(t);
  cli(dir);
  fill(dir);
  git(dir, 'commit', '--allow-empty', '-m', 'next subject');
  let result = cli(dir, 'check');
  assert.equal(result.status, 1);
  assert.match(result.output, /交接可能已过期/);
  cli(dir, '--force');
  fill(dir);
  git(dir, 'checkout', '-b', 'another');
  result = cli(dir, 'check');
  assert.equal(result.status, 1);
  assert.match(result.output, /交接可能已过期/);
});

test('existing handoff is byte-for-byte preserved without force', t => {
  const dir = repo(t);
  cli(dir);
  fill(dir);
  const before = read(dir);
  fs.appendFileSync(path.join(dir, 'base.txt'), 'change\n');
  assert.equal(cli(dir).status, 0);
  assert.equal(read(dir), before);
  assert.equal(cli(dir, 'init').status, 2);
  assert.equal(read(dir), before);
  assert.equal(cli(dir, '--force').status, 1);
  assert.notEqual(read(dir), before);
});

test('fill only prints actionable six-section prompt and never writes', t => {
  const dir = repo(t);
  const result = cli(dir, '--fill');
  assert.equal(result.status, 0, result.output);
  for (const title of titles) assert.ok(result.stdout.includes(title));
  assert.match(result.stdout, /handoff check/);
  assert.ok(!fs.existsSync(path.join(dir, 'HANDOFF.md')));
});

test('notes preserve raw text at end without corrupting existing sections', t => {
  const dir = repo(t);
  cli(dir);
  fill(dir);
  const before = read(dir);
  const notes = '## 4. 试过但失败的方案\n```\n聊天原文\n````\n';
  fs.writeFileSync(path.join(dir, 'notes.txt'), notes);
  const result = cli(dir, '--notes', 'notes.txt');
  assert.equal(result.status, 0, result.output);
  const md = read(dir);
  assert.ok(md.startsWith(before));
  assert.ok(md.includes(notes));
  assert.match(md.slice(before.length), /## 附注/);
  assert.equal(section(md, 4), section(before, 4));
  assert.equal(cli(dir, 'check').status, 0);
});

test('missing notes and invalid argument combinations do not create or overwrite files', t => {
  const dir = repo(t);
  for (const args of [['--notes', 'absent.txt'], ['check', '--force'], ['--fill', '--notes', 'absent'], ['--unknown']]) {
    assert.equal(cli(dir, ...args).status, 2, args.join(' '));
    assert.ok(!fs.existsSync(path.join(dir, 'HANDOFF.md')));
  }
});

test('handles unborn branches and detached HEAD', t => {
  const dir = repo(t, false);
  assert.equal(cli(dir).status, 1);
  fill(dir);
  assert.equal(cli(dir, 'check').status, 0);
  git(dir, 'add', 'base.txt');
  git(dir, 'commit', '-m', 'first');
  assert.match(cli(dir, 'check').output, /交接可能已过期/);
  git(dir, 'checkout', '--detach');
  cli(dir, '--force');
  fill(dir);
  assert.equal(cli(dir, 'check').status, 0);
  assert.match(read(dir), /当前分支：\(detached HEAD\)/);
});

test('finds repo root when invoked from subdirectory', t => {
  const dir = repo(t);
  const subdir = path.join(dir, 'sub');
  fs.mkdirSync(subdir);
  assert.equal(cli(subdir).status, 1);
  assert.ok(fs.existsSync(path.join(dir, 'HANDOFF.md')));
  assert.ok(!fs.existsSync(path.join(subdir, 'HANDOFF.md')));
});

test('repository paths ending in whitespace are preserved', t => {
  const dir = repo(t);
  const odd = dir + ' \n';
  fs.renameSync(dir, odd);
  t.after(() => fs.rmSync(odd, { recursive: true, force: true }));
  const result = cli(odd);
  assert.equal(result.status, 1, result.output);
  assert.ok(fs.existsSync(path.join(odd, 'HANDOFF.md')));
});

test('new notes are fenced verbatim in a newly generated handoff', t => {
  const dir = repo(t);
  const note = '第一行\n## 1. 当前目标\n```sh\n不执行的聊天片段\n```';
  fs.writeFileSync(path.join(dir, 'notes.txt'), note);
  const result = cli(dir, '--notes', 'notes.txt');
  assert.equal(result.status, 1, result.output);
  const md = read(dir);
  assert.ok(md.includes(note));
  assert.ok(md.lastIndexOf('## 附注') > md.lastIndexOf('## 最近 5 条 commit 标题'));
  assert.match(result.output, /缺：当前目标/);
});

test('reports missing handoff and non-repo with useful errors', t => {
  const dir = repo(t);
  const result = cli(dir, 'check');
  assert.equal(result.status, 1);
  assert.match(result.output, /HANDOFF.md/);
  assert.ok(!fs.existsSync(path.join(dir, 'HANDOFF.md')));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-no-git-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  assert.equal(cli(outside).status, 2);
});

test('special filenames, renamed and binary files do not break statistics', t => {
  const dir = repo(t);
  git(dir, 'mv', 'base.txt', 'renamed.txt');
  const strange = '奇怪\n文件\t".txt';
  fs.writeFileSync(path.join(dir, strange), 'text\n');
  fs.writeFileSync(path.join(dir, 'blob.bin'), Buffer.from([0, 1, 2]));
  cli(dir);
  const body = section(read(dir), 3);
  assert.ok(body.includes(JSON.stringify(strange)));
  assert.ok(body.includes('"renamed.txt"'));
  assert.match(body, /"blob.bin": \+- --/);
  assert.equal(body.split('\n').filter(s => s.startsWith('- ')).length, 4);
});

test('only five most recent commit subjects appear', t => {
  const dir = repo(t);
  for (let n = 1; n <= 6; n++) git(dir, 'commit', '--allow-empty', '-m', `subject-${n}`);
  cli(dir);
  const md = read(dir);
  for (let n = 2; n <= 6; n++) assert.ok(md.includes(`subject-${n}`));
  assert.ok(!md.includes('subject-1'));
  assert.ok(!md.includes('initial subject'));
});

test('force refuses symlink handoff instead of touching its target', t => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, 'target.txt'), 'keep');
  fs.symlinkSync('target.txt', path.join(dir, 'HANDOFF.md'));
  assert.equal(cli(dir, '--force').status, 2);
  assert.equal(fs.readFileSync(path.join(dir, 'target.txt'), 'utf8'), 'keep');
});

test('install-hook reminder never blocks real git commit or generates HANDOFF', t => {
  const dir = repo(t);
  const result = cli(dir, 'install-hook');
  assert.equal(result.status, 0, result.output);
  fs.appendFileSync(path.join(dir, 'base.txt'), 'next\n');
  git(dir, 'add', 'base.txt');
  const commit = run(dir, 'git', ['commit', '-m', 'commit despite missing handoff']);
  assert.equal(commit.status, 0, commit.output);
  assert.match(commit.output, /缺：HANDOFF.md/);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'commit despite missing handoff');
  assert.ok(!fs.existsSync(path.join(dir, 'HANDOFF.md')));
});

test('hooks preserve existing config, run only check and install idempotently', t => {
  const dir = repo(t);
  const existing = {
    '.claude/settings.local.json': { permissions: { allow: ['Read'] }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing-claude' }] }] } },
    '.codex/hooks.json': { description: 'keep me', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo existing-codex' }] }] } },
    '.cursor/hooks.json': { version: 1, hooks: { afterFileEdit: [{ command: 'echo existing-cursor' }] } },
  };
  for (const [name, data] of Object.entries(existing)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), JSON.stringify(data));
  }
  assert.equal(cli(dir, 'install-hook').status, 0);
  const first = Object.keys(existing).map(name => fs.readFileSync(path.join(dir, name), 'utf8'));
  assert.equal(cli(dir, 'install-hook').status, 0);
  assert.deepEqual(Object.keys(existing).map(name => fs.readFileSync(path.join(dir, name), 'utf8')), first);
  for (let i = 0; i < first.length; i++) {
    const data = JSON.parse(first[i]);
    const original = Object.values(existing)[i];
    for (const key of Object.keys(original.hooks)) assert.deepEqual(data.hooks[key], original.hooks[key]);
    const event = i === 2 ? data.hooks.sessionEnd : data.hooks.SessionEnd;
    assert.equal(event.length, 1);
    const handler = i === 2 ? event[0] : event[0].hooks[0];
    assert.match(handler.command, / check/);
    assert.doesNotMatch(handler.command, /npx|--force|--fill| init|https?:/);
    const subdir = path.join(dir, 'sub');
    fs.mkdirSync(subdir, { recursive: true });
    const checkResult = run(i === 2 ? dir : subdir, 'sh', ['-c', handler.command], { input: '{"reason":"other"}' });
    assert.equal(checkResult.status, 0, checkResult.output);
    assert.match(checkResult.output, /缺：HANDOFF.md/);
    assert.ok(!fs.existsSync(path.join(dir, 'HANDOFF.md')));
  }
  assert.deepEqual(JSON.parse(first[0]).permissions, { allow: ['Read'] });
  assert.equal(JSON.parse(first[1]).description, 'keep me');
  assert.equal(JSON.parse(first[2]).version, 1);
});

test('existing pre-commit with early exit still runs after reminder', t => {
  const dir = repo(t);
  const hook = path.join(dir, '.git/hooks/pre-commit');
  const original = '#!/bin/sh\necho original-hook-ran >&2\nexit 0\n';
  fs.writeFileSync(hook, original, { mode: 0o755 });
  assert.equal(cli(dir, 'install-hook').status, 0);
  const installed = fs.readFileSync(hook, 'utf8');
  assert.equal(cli(dir, 'install-hook').status, 0);
  assert.equal(fs.readFileSync(hook, 'utf8'), installed);
  assert.equal(fs.readFileSync(hook + '.handoff-original', 'utf8'), original);
  const commit = run(dir, 'git', ['commit', '--allow-empty', '-m', 'chained']);
  assert.equal(commit.status, 0, commit.output);
  assert.match(commit.output, /缺：HANDOFF.md/);
  assert.match(commit.output, /original-hook-ran/);
});

test('preserves a pre-existing hook failure instead of bypassing user policy', t => {
  const dir = repo(t);
  fs.writeFileSync(path.join(dir, '.git/hooks/pre-commit'), '#!/bin/sh\necho original-rejected >&2\nexit 7\n', { mode: 0o755 });
  assert.equal(cli(dir, 'install-hook').status, 0);
  const commit = run(dir, 'git', ['commit', '--allow-empty', '-m', 'must not happen']);
  assert.notEqual(commit.status, 0);
  assert.match(commit.output, /缺：HANDOFF.md/);
  assert.match(commit.output, /original-rejected/);
  assert.equal(git(dir, 'log', '-1', '--format=%s'), 'initial subject');
});

test('invalid tool config is rejected before installing any hooks', t => {
  const dir = repo(t);
  fs.mkdirSync(path.join(dir, '.cursor'));
  const filename = path.join(dir, '.cursor/hooks.json');
  fs.writeFileSync(filename, '{broken json');
  const result = cli(dir, 'install-hook');
  assert.equal(result.status, 2);
  assert.match(result.output, /hooks.json/);
  assert.equal(fs.readFileSync(filename, 'utf8'), '{broken json');
  assert.ok(!fs.existsSync(path.join(dir, '.git/hooks/pre-commit')));
  assert.ok(!fs.existsSync(path.join(dir, '.claude/settings.local.json')));
  assert.ok(!fs.existsSync(path.join(dir, '.git/handoff/handoff.cjs')));
});

test('custom core.hooksPath is honored', t => {
  const dir = repo(t);
  git(dir, 'config', 'core.hooksPath', '.hooks');
  assert.equal(cli(dir, 'install-hook').status, 0);
  assert.ok(fs.existsSync(path.join(dir, '.hooks/pre-commit')));
  assert.ok(!fs.existsSync(path.join(dir, '.git/hooks/pre-commit')));
  const commit = run(dir, 'git', ['commit', '--allow-empty', '-m', 'custom hook']);
  assert.equal(commit.status, 0, commit.output);
  assert.match(commit.output, /缺：HANDOFF.md/);
});

test('linked git worktrees receive an independent local runner', t => {
  const dir = repo(t);
  const worktree = path.join(dir, 'linked');
  git(dir, 'worktree', 'add', '-b', 'linked', worktree);
  assert.equal(cli(worktree, 'install-hook').status, 0);
  const runner = git(worktree, 'rev-parse', '--path-format=absolute', '--git-path', 'handoff/handoff.cjs');
  assert.ok(fs.existsSync(runner));
  assert.ok(!fs.existsSync(path.join(dir, '.git/handoff/handoff.cjs')));
  const commit = run(worktree, 'git', ['commit', '--allow-empty', '-m', 'worktree hook']);
  assert.equal(commit.status, 0, commit.output);
  assert.match(commit.output, /缺：HANDOFF.md/);
});
