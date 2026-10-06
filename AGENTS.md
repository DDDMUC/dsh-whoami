# AGENTS.md — dsh-whoami

本仓是一个独立的 DeepSeek Harness 宿主插件（host-only，无浏览器半区）。规则：

- **手写 JS，直接进 `lib/`**：没有构建步骤，`lib/` 是源也是产物，改动后要跑测试再提交。
- **测试用 `node --test`**：`npm test`，用例放 `test/*.test.js`；纯事实拼装在 `lib/identity.js`（无 cordis、无 IO、无时钟），接线条在 `lib/index.js`。
- **只写受管变量**：所有对外事实都经 `ctx.shellEnv.register` 的 `variables` 声明；`variables` 的键集必须与 `lib/identity.js` 的 `WHOAMI_KEYS` 一致（有测试钉住）。
- **不猜**：拿不到的事实一律省略，不写 `unknown`、不写占位值。
- **只读 `inject` 声明的服务**：宿主上下文对未声明的服务**直接抛错**（`cannot get property "x" without inject`）。机会式使用一律 `ctx.inject([...], scope => …)`（服务不存在时回调根本不跑），并且 `resolve` 全程 `try/catch` —— 它的异常会打挂**每一次模型 shell 调用**（首版就是这样翻车的：读了未声明的 `ctx.sessionProjections`）。
- **改代码要重启宿主**：宿主只在启动时导入模块。`patchReload: live` 只重载 patch 层（启用/禁用即时生效），改 `lib/*.js` 后必须重启 `dsh web` 才会加载新代码。
- **跨机开发日志**：改动记录在私有库 [DDDMUC/repo-devlogs](https://github.com/DDDMUC/repo-devlogs) 的 **`dsh-whoami/`** 文件夹（`HANDOFF.md` 最新一轮在最上面；macOS 端写 `WORKLOG-macos.md`，条目以 `[macOS]` 开头）。按该库规矩，每条先写 `**运行环境**`（设备 / 应用 / 服务商与模型），再写做了什么、动了哪些文件、怎么验证、遗留问题。
