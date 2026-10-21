# 本地验证记录

## 2026-10-21 两项格式修正

范围：第三节排除根目录 `HANDOFF.md` 自身，文件名去掉外层引号并保留 JSON 字符转义；同步检查器、补全提示词和文档。生成时不再为自身计数循环重写。

环境：Windows / PowerShell，Node.js v24.16.0、Git 2.54.0.windows.1。此轮初始验证时尚未发布 npm 或推送远程。

- 先调整现有测试并确认三项因旧行为失败：包含自身、余量多计一个文件、仅有交接文件改动时误报第三节为空；修正后四项聚焦检查全部通过（另含真实业务改动仍报缺的检查）。
- `npm run check`、`git diff --check` 通过。
- 原测试夹具将 `os.devNull` 传给 Git；Windows 的 `\\.\nul` 被 Git 拒绝。仅在本地 `.git/windows-test-env.cjs` 中临时将其改为 `NUL`，并在测试进程 PATH 加入 Git 的 `usr/bin` 以运行 shell hooks；不改变运行时代码或提交测试环境适配。
- 使用以上环境运行 `npm test`：27 项，22 通过、5 失败。其中“existing handoff is byte-for-byte preserved without force”和“notes preserve raw text at end without corrupting existing sections”原先依赖交接文件自身使第三节非空；改用真实业务文件改动作为夹具后，仅复跑这两项，2/2 通过。其他已通过用例的相关输入未变，复用结果，累计 24 项通过。
- 其余三项未通过属于本机环境限制：`repository paths ending in whitespace are preserved` 和 `special filenames, renamed and binary files do not break statistics` 使用 Windows 不允许的换行/制表符/双引号路径；`force refuses symlink handoff instead of touching its target` 创建符号链接时返回 EPERM。这三项需在 Linux 重跑，不能宣称本次 27/27 通过。

状态：VALIDATED_LOCAL。真实 Codex → Claude Code / Cursor 切换、Codex / Cursor 宿主实际触发会话结束 hook、接手工具重复追问次数均未实测。测试中直接运行 hook 命令不代表宿主已触发，也不构成需求验证。

补丁发布准备：版本升为 `0.1.1`，CLI 与包元数据一致；`npm run check` 通过。重新执行现有测试得到 24 pass / 3 fail，仍为上述三项 Windows 环境限制。`npm pack --offline --pack-destination dist --json` 产出四文件零依赖包，解包后 `--version` 返回 `0.1.1`。这不替代 Linux 三项补验或真实宿主 hook 验证。

## 2026-10-20 初版验证（历史记录）

日期：2026-10-20。环境：Linux，Node.js v24.19.0、npm 11.9.0、Git 2.52.0。

## 自动测试

`npm test`：27 tests / 27 pass / 0 fail。

`npm run check`：单文件 `node --check handoff.cjs` 通过。

使用真实临时 Git 仓库，覆盖用户六项验收及空仓库、detached HEAD、文件名转义、重命名、二进制、子目录、末尾空白仓库路径、附注围栏、原有 hook 的成功/失败、配置保留/幂等/无效输入、自定义 hooksPath 和 linked worktree。

曾先执行缺失功能的测试并观察失败；十行上限、括号占位/空代码块和仓库路径末尾空白问题分别在回归用例失败后修复。

## 打包后的真实使用

`npm pack --offline --pack-destination dist` 生成 `handoff-local-0.1.0.tgz`，只有 `handoff.cjs`、`package.json`、`README.md`、`LICENSE`；无任何外部依赖。

从独立的空 npm 缓存执行：

```sh
npx --offline --yes --package /workspace/handoff/dist/handoff-local-0.1.0.tgz handoff
```

所有以下验证通过：

1. 生成时收集真实改动，第三节文件和余量提示共十行。
2. 留空失败方案，`check` 输出 `缺：试过但失败的方案`，返回 1。
3. 补全后检查返回 0；新建提交后提示 `交接可能已过期`，返回 1。
4. 再运行默认命令，已有文件逐字节未变。
5. 从包安装 hooks，删除 npm 缓存与 HANDOFF.md，再执行真实提交：提交返回 0、产生新 commit，显示 `缺：HANDOFF.md`，且未重新生成文件。
6. 删除缓存后，三个生成的会话 hook 命令均能独立运行，显示缺项且返回 0。

Claude Code、Codex 和 Cursor 的完整应用会话未在此环境启动；配置结构、事件时机及信任要求已依据官方文档核实，具体链接见 README。宿主是否显示 SessionEnd 输出以及是否信任配置由宿主管理。

## 交付边界

运行时代码为单个 `handoff.cjs`；MIT 许可证。初次实现验证使用本地包或源码运行，未启动服务、调用模型或读取聊天记录。后续公开发布由用户另行授权，包名为 `handoff-local`，GitHub 仓库为 `chuchaoT/handoff`。
