# 本地验证记录

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

运行时代码为单个 `handoff.cjs`；MIT 许可证。npm registry 未发布，使用随附的本地包或源码运行。未启动服务、调用模型、读取聊天记录或执行任何远程发布。
