# handoff 设计与实现计划

按用户给定规格直接实现，不增加需确认的产品功能。时间起点：2026-10-20 15:04 UTC；最迟停止：19:04 UTC。

单文件 `handoff.cjs`，Node >=18，运行时零依赖，只有 Git 子进程，不联网或读取聊天记录。`package.json` 暴露 `handoff` 命令，MIT 许可。测试使用 Node 内置测试库和真实临时 Git 仓库。

六节固定中文二级标题，元数据保存 ISO UTC 时间、分支和完整 HEAD；附录列最近五个提交标题。`init` 六节留空；普通生成只自动填写第三节。未跟踪文件计行，二进制以 `-` 表示未知行数；状态使用 NUL 分隔，统计使用 `git diff --stat` / `--numstat`，不输出补丁。列表排除根目录 HANDOFF.md 自身，文件名不加外层引号但保留 JSON 字符转义，最多十行；超过十个文件时展示九个文件加一行余量提示。

已有文件默认只检查，`--force` 明确允许重建。`--notes` 是显式追加操作，保留已有文件全部字节，并在末尾附注以代码围栏保存原文；不刷新元数据。`--fill` 只打印提示词，指导当前智能体保留事实并补全六节、刷新自动字段，然后执行检查。

检查忽略 HTML 注释和模板占位，要求第 1/4/5/6 节有实际内容；“无”可作为明确结论。工作区有改动而第三节空、分支或 HEAD 不一致也失败。退出码：0 成功，1 检查发现问题，2 使用或操作错误。彩色终端红字，支持 NO_COLOR / FORCE_COLOR。

安装使用 Git 实际 hooks 路径；原 pre-commit 移为同目录备份，由新 wrapper 在提醒之后执行，保留原有提交限制。本工具的 check 错误始终被吞掉。复制单文件到 worktree 的 Git 私有目录，不依赖 npx 缓存。先验证所有配置再写入，合并并幂等安装 Claude / Codex / Cursor 会话结束 hooks；不改全局配置。Gemini 仅记录官方支持和手动工作流，不增加安装范围。

官方核实（2026-10-20）：
- Claude Code https://code.claude.com/docs/en/hooks ：`.claude/settings.local.json`，`hooks.SessionEnd[].hooks[]`、`type: command`；SessionEnd 无阻断能力，明确设置 timeout。
- Codex https://developers.openai.com/codex/hooks ：`.codex/hooks.json`，`SessionEnd`，最多 3 秒，需要用户在工具 `/hooks` 中信任配置。
- Cursor https://cursor.com/docs/hooks ：`.cursor/hooks.json`，`version: 1`，`hooks.sessionEnd[].command`，响应只记录。
- Gemini https://geminicli.com/docs/hooks/ ：有 advisory `SessionEnd`，本版本不自动接入。

实现顺序：
1. [x] 先运行 CLI 验收测试见到失败，再实现生成、检查、提示词和附注。
2. [x] 先运行 hook 集成测试见到失败，再实现预检、合并、备份、幂等安装和本地副本。
3. [x] 编写 README、MIT 许可，打包并验证离线 npx 一条命令。
4. [x] 全量测试、检查单文件语法、手工查看输出和真实提交结果，审查边界。结果见 verification.md。

重点边界：暂存/未暂存/未跟踪/重命名/删除/二进制/特殊文件名；空仓库和 detached HEAD；已有 hook 的早退与失败；已有 JSON 配置的保留；非仓库、缺失笔记或无效配置不应破坏文件。
