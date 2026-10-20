# handoff

在 Git 仓库根目录生成 `HANDOFF.md`，让 Codex、Claude Code、Cursor、Gemini 或人工接手时知道做到哪里、卡在哪里、接下来做什么。

单文件 Node.js CLI，**零依赖、纯本地**。不启动服务，不调用大模型，不联网，不自动读取工具聊天记录。Git 元数据和文件统计由程序采集，任务事实由你或当前智能体填写。

## 安装与运行

需要 **Node.js ≥18、npm、Git ≥2.31**。支持 Linux、macOS、WSL；hook 使用 POSIX shell。原生 Windows / PowerShell 未验证。无需 `npm install` 即可开发和测试。

下载本项目提供的 `handoff-local-0.1.0.tgz` 后，在目标 Git 仓库中一条命令运行（将包路径换成下载位置）：

```sh
npx --offline --yes --package /path/to/handoff-local-0.1.0.tgz handoff
```

或一条命令安装为 `handoff`：

```sh
npm install --offline --global /path/to/handoff-local-0.1.0.tgz
```

本仓库已生成的包位于 `dist/handoff-local-0.1.0.tgz`。从源码重新打包：

```sh
mkdir -p dist
npm pack --offline --pack-destination dist
```

也可以直接运行单文件：

```sh
node /path/to/handoff/handoff.cjs --help
```

**包尚未发布至 npm registry**；上述本地包与 `--offline` 命令可以使用，不要用 `npx handoff` 下载同名的无关包。将来发布 `handoff-local` 后也能通过包名运行，命令名仍为 `handoff`。本工具和所安装的 hooks 都不会调用 npm 或联网。

## 命令

```sh
handoff init                     # 生成六个空节的模板，返回 0
handoff                          # 不存在则生成并检查；存在则保留原文并检查
handoff --force                  # 明确允许重建，然后检查（会清空人工填写的六节内容）
handoff check                    # 只检查，不修改 HANDOFF.md
handoff --fill                   # 只向终端打印当前 AI 可执行的补全提示词
handoff --notes notes.txt        # 生成时带入附注；已有文件则只追加附注，再检查
handoff --force --notes notes.txt
handoff init --force             # 重新生成六节空模板
handoff install-hook             # 安装 Git 和受支持工具的会话结束提醒
handoff --help
handoff --version
```

未全局安装时，可把上述每条命令的 `handoff` 换为 `npx --offline --yes --package /path/to/handoff-local-0.1.0.tgz handoff`，或 `node /path/to/handoff.cjs`。

从子目录运行也写到仓库根目录；`--notes` 路径相对于当前终端目录。参数错误、笔记文件不存在等操作错误返回 `2`。不支持的参数组合会在任何写入前拒绝。

`handoff` 新生成的文件通常返回 `1`：第 1、4、5、6 节还需要真实上下文，这个退出码是在提醒补全。`init` 创建模板成功返回 `0`，不会自动执行检查。

默认已有文件**不会被重建或刷新**，包括元数据、第三节和提交附录；`--notes` 是显式授权的追加操作，会保留此前全部原文。`--force` 允许丢弃旧内容并重建；如果要保留已有任务记录并更新它，使用 `--fill` 的提示词或手工编辑。

## 推荐工作流

先运行 `handoff` 收集本地信息，再让当前智能体执行 `handoff --fill` 打印的提示词，补全事实，最后运行 `handoff check`。下一个工具先读 `HANDOFF.md`。

以下规则可直接复制进 `AGENTS.md` / `CLAUDE.md`；也可放进 Cursor 的项目指令或 `GEMINI.md`：

```text
额度快用完或结束任务前，先运行 handoff --fill 补全交接，再运行 handoff check。
--fill 只打印提示词；请按提示词实际编辑 HANDOFF.md，保留已有有效记录，
核实并更新文件头、第三节和最近提交，补全六节，修复 check 报出的漏项后再结束。
确实没有失败方案或失败测试时，明确写“无”并说明；不要编造事实。
```

工具不会检测额度或在额度耗尽时自动生成交接；应在智能体仍能执行任务时主动触发。

## 文件结构与统计

```md
# HANDOFF

生成时间：2026-10-20T15:00:00.000Z
当前分支：main
最新 commit：完整哈希

## 1. 当前目标
## 2. 已完成
## 3. 改到一半的文件
## 4. 试过但失败的方案
## 5. 没跑通的测试或报错
## 6. 下一步具体做什么
## 最近 5 条 commit 标题
## 附注
```

`init` 的六节只有占位注释。普通生成自动填写第三节，其他节仍由人或智能体补全。附注是可选项，放在文件最末尾；使用足够长的代码围栏保留笔记原文，即使笔记含 Markdown 标题或代码围栏，也不会变成交接正文。

第三节示例：

```text
- "src/main.js": +12 -3
- "tests/new test.js": +28 -0
- "HANDOFF.md": +41 -0
```

- 文件集合来自 `git status --porcelain=v1 -z --untracked-files=all`，包括暂存、未暂存、未跟踪文件和 `HANDOFF.md` 本身；忽略文件遵循 Git 配置。
- 已跟踪文件读取本地 `git diff --stat HEAD` / `--numstat -z HEAD`；实际调用禁用外部 diff、textconv 和重命名折叠。计数是 **HEAD 到当前工作区的净变化**，合并暂存与未暂存变化；相互抵消或仅权限变化可以是 `+0 -0`。
- 重命名按 Git status 的目标文件名列一行，计数合并旧路径删除与新路径新增。不会贴出补丁或源文件内容。
- 未跟踪文本文件按本地行数记新增，末行没有换行也计一行。二进制文件的未知行数显示 `+- --`；子模块等无行数变化项显示 `+0 -0`。
- **整个文件列表最多 10 个非空行**：至多 10 个文件；若超过 10 个，显示前 9 个，加一行 `另有 N 个文件`。顺序遵循 Git status。文件名使用 JSON 转义，路径中的换行、制表符不会额外占行。
- 空仓库使用 `(尚无提交)`；游离分支使用 `(detached HEAD)`。最近提交附录最多列五个标题。

统计反映生成时的快照；运行过程中应避免同时更改仓库。检查只验证第三节是否缺失，不验证其中每一行是否仍与当前工作区一致；`--fill` 指示智能体重新核实。

## 检查规则与退出码

| 情况 | 提示 |
| --- | --- |
| 第 1、4、5、6 节不存在、为空、仅注释或模板占位 | `缺：<节名>` |
| 有未提交改动，但第三节为空或仅占位 | `缺：改到一半的文件` |
| 文件头分支或完整 commit 与当前仓库不符，或缺失 | `交接可能已过期` |
| 没有文件 | `缺：HANDOFF.md` |

有任何检查问题返回 `1`，全部通过返回 `0`；操作或参数错误返回 `2`。交互终端的问题提示为红色；重定向时输出纯文本。可用 `FORCE_COLOR=1` 强制颜色，`NO_COLOR=1` 禁用自动颜色。

占位注释、空清单、`TODO`、`TBD`、`待填写` 等不算已填写。明确的“无”是有效内容；检查器不判断描述是否真实、不运行测试。第 2 节可以为空；无改动时第 3 节可以为空。

## Hook 支持情况

根据 **2026-10-20 核实的官方文档**，当前四种工具均已有会话结束 hook；并非“Codex/Cursor 没有 hooks”。旧版本可能不支持，需升级或使用上面的手动工作流。

| 宿主 | 官方机制 | `install-hook` 行为 |
| --- | --- | --- |
| Git | `pre-commit` | 安装仅提醒的 wrapper，兼容 `core.hooksPath` 和 worktree |
| Claude Code | `SessionEnd`，不是每轮响应的 `Stop` | 合并项目 `.claude/settings.local.json` 的 `hooks.SessionEnd[].hooks[]`，`type: command`、`timeout: 3` |
| Codex | `SessionEnd` | 合并项目 `.codex/hooks.json`，同样使用命令 handler，`timeout: 3`；在 Codex `/hooks` 中审核并信任后生效 |
| Cursor | `sessionEnd` | 合并项目 `.cursor/hooks.json`，`version: 1`、`hooks.sessionEnd[].command` |
| Gemini CLI | advisory `SessionEnd` | 此版本按要求仅支持交接文件及手动规则，不额外安装 Gemini hook |

官方参考：[Claude Code hooks](https://code.claude.com/docs/en/hooks#sessionend)、[Codex hooks](https://developers.openai.com/codex/hooks)、[Cursor hooks](https://cursor.com/docs/hooks)、[Gemini CLI hooks](https://geminicli.com/docs/hooks/)。

安装细节：

- 所有新增 hook **只执行 `handoff check`**，检查输出转到 stderr，随后将失败转换为成功返回；不会生成或补全交接，不会要求 AI 继续工作，也不会因交接不完整而阻止提交。
- 安装会将单文件 CLI 复制到当前 worktree 的 Git 私有目录 `handoff/handoff.cjs`，固定当前 Node 可执行文件路径。运行不依赖临时 npx 缓存，且不会联网下载工具。升级 handoff 或迁移 Node 后重新运行 `install-hook` 更新副本。
- 已有 `pre-commit` 会移动为同目录 `pre-commit.handoff-original`，新 wrapper 先提醒，再执行原来可执行的 hook。**原有 hook 自己的拒绝提交行为仍然保留**。只跳过交接错误，不绕过你的其他检查。
- JSON 配置以合并方式保留其他设置和 hooks，重复安装不会重复注册。配置无效时在写入前报错；不会尝试修复或覆盖未知格式。不会修改用户级配置或启用已禁用的 hooks。
- Git hook 文件与 `core.hooksPath` 可以被多个 worktree / 仓库共享。wrapper 在执行时解析当前仓库的本地副本；每个需要提醒的 worktree 都应运行一次 `install-hook`。
- 会话结束时机和输出可见性由宿主决定：它可能只记录到 hook 日志，异常强制退出也可能不触发。Claude `/hooks`、Codex `/hooks` 和工具日志可用于核对。安装配置不等于绕过宿主的工作区信任或管理员策略。
- Claude 本地设置通常不应提交；Codex/Cursor 的项目 hooks 若要提交分享，先审查其中机器特定的 Node 路径。程序不会替你修改 `.gitignore`。

卸载时删除本工具标记的 Git wrapper，将 `pre-commit.handoff-original`（若有）移回 `pre-commit`；从三个 JSON 文件中移除 command 以 `# handoff-check-only` 结尾的本工具 handler，保留其他配置，再删除 Git 私有目录中的 `handoff/`。如果原 hook 曾引用自身的文件名，备份后运行路径会变化，应自行检查该脚本的假设。

## 开发与验收

```sh
npm test
npm run check
```

测试仅使用 Node 内置测试库，创建并清理本地临时仓库，不用真实账户或联网。覆盖六项验收：

1. 真实暂存、未暂存、未跟踪改动与 Git status 一致；第三节总行数不超过 10。
2. 失败方案一节留占位或空内容时，报缺且返回非零。
3. 新建 commit / 切换分支后提示交接过期。
4. 已有交接默认逐字节保留，只有显式 `--force` 重建。
5. 安装后真实执行 `git commit`，能看到缺项提示，提交仍成功。
6. 其他边界包括文件名转义、二进制、空仓库、detached HEAD、笔记围栏、配置保留、幂等安装、自定义 hooksPath 和 linked worktree。

发布准备：`npm pack --offline --pack-destination dist`。发布包只包含 CLI、README、许可证与包元数据，运行时代码始终只有 `handoff.cjs` 一个文件。

不包含：自动聊天记录读取、额度检测、AI 摘要、云同步、团队功能、按工具转换规则、图形界面或收费功能。

MIT License。
