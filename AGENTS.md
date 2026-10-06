# AGENTS.md — dsh-whoami

本仓是一个独立的 DeepSeek Harness 宿主插件（host-only，无浏览器半区）。规则：

- **手写 JS，直接进 `lib/`**：没有构建步骤，`lib/` 是源也是产物，改动后要跑测试再提交。
- **测试用 `node --test`**：`npm test`，用例放 `test/*.test.js`；纯事实拼装在 `lib/identity.js`（无 cordis、无 IO、无时钟），接线条在 `lib/index.js`。
- **只写受管变量**：所有对外事实都经 `ctx.shellEnv.register` 的 `variables` 声明；`variables` 的键集必须与 `lib/identity.js` 的 `WHOAMI_KEYS` 一致（有测试钉住）。
- **不猜**：拿不到的事实一律省略，不写 `unknown`、不写占位值。
- **跨机开发日志**：改动记录在私有库 [DDDMUC/repo-devlogs](https://github.com/DDDMUC/repo-devlogs) 的 **`dsh-whoami/`** 文件夹（`HANDOFF.md` 最新一轮在最上面；macOS 端写 `WORKLOG-macos.md`，条目以 `[macOS]` 开头）。按该库规矩，每条先写 `**运行环境**`（设备 / 应用 / 服务商与模型），再写做了什么、动了哪些文件、怎么验证、遗留问题。
