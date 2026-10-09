# dsh-whoami

**让 agent 随时知道自己是谁：把「设备 / 应用 / 服务商 / 模型 / reasoning effort」写进每次模型 shell 调用的受管 `DSH_*` 变量。** 不注入系统提示、不加工具、不开路由——`env | grep DSH` 即可读到，答案随每一轮请求自动刷新。

[中文](#中文) · [English](#english)

---

## 中文

## 为什么需要它

被问「你在哪台机器、哪个应用、什么模型？切换模型你会知道吗？」时，agent 只能靠猜：设备和应用能从 `DSH_PROFILE` / `DSH_WEB_URL` 之类推出来，**模型和 effort 却没人告诉它**——它们按会话存在宿主侧（会话投影 `modelSelection`），模型自己读不到。跨机开发日志要求每条记录写明「设备 / 应用 / 服务商 / 模型」，于是每次都得人工查一遍。

本插件把这几项变成 agent 每次 shell 调用都能读到的受管变量。

## 它写入什么

| 变量 | 内容 | 例 |
| --- | --- | --- |
| `DSH_DEVICE` | 机器 + 系统 + 架构 | `mudeMacBook-Air.local (darwin 26.7.1, arm64)` |
| `DSH_APP` | 应用 + dsh 版本 + profile + 地址 | `DeepSeek Harness Web GUI (dsh 0.2.0-rc.2, profile web, http://127.0.0.1:3080)` |
| `DSH_PROVIDER` | 服务商路由 | `cline-pass` |
| `DSH_MODEL` | 具体模型 id | `cline-pass/deepseek-v4.1-flash` |
| `DSH_EFFORT` | reasoning effort（有才写） | `high` |

规则：**拿不到就不写**（不写 `unknown`、不猜）。所以 `DSH_MODEL` 不存在 = 这台宿主没有可读的模型记录，而不是"模型是 unknown"。

## 数据来源

- `DSH_DEVICE`：`node:os` 的 hostname / platform / release + `process.arch`。
- `DSH_APP`：`DSH_WEB_URL`（有 → Web GUI）、`DSH_PROFILE`、以及 `@deepseek-ai/dsh` 的版本号；都拿不到就是 `DeepSeek Harness`。行配置 `config.appLabel` 可覆盖。
- `DSH_PROVIDER` / `DSH_MODEL` / `DSH_EFFORT`：当前会话的**持久化投影 `modelSelection`**（`ctx.sessionProjections.snapshot(session, ['modelSelection'])`），取值 `lastUsed` —— 它是最近一次已提交请求头里的真实 provider/model，不是你"期望"的偏好。宿主没有投影注册表、或会话还没发过请求 → 三个键一并省略。

## 安装

```sh
dsh plugin --profile web add link:$PWD        # 本仓
# 或发布后：dsh plugin --profile web add dsh-whoami
```

bundle 行属于 profile 组合，通常需要重启宿主；profile 设了 `patchReload: live` 时热加载生效。

## 验证

```sh
# 在 agent 的 shell 里（模型自己跑一次 bash 即可）
env | grep '^DSH_'
```

## 已知限制

- 只写**受管** `DSH_*` 变量；宿主每次 shell 调用重建该命名空间，环境里其他 `DSH_*` 会被丢弃后重新注入。
- 模型信息是"最近一次请求"的真实值：你在界面上切了模型但还没发消息时，读到的是上一次的（新选择要等一次请求落地才成为 `lastUsed`）。
- 宿主侧 `sessionProjections` 缺失、或投影形态变化 → 模型三项省略并保持安静（不报错、不影响 shell 调用）。
- 不注入系统提示、不写任何日志，所以 agent 不会"被提醒"模型变了；它只是每次都能**查**到当前值。

## 安全模型

只发布非敏感事实：主机名、系统/架构字符串、profile 名、监听地址、provider/model id、effort。不含密钥、不含 token、不含会话内容，也不写盘。

## English

## Why

Asked "which machine, which app, which model are you on — and would you notice a model switch?", an agent can only guess. Device and application are inferable from the managed environment (`DSH_PROFILE`, `DSH_WEB_URL`), but the **model and reasoning effort** live host-side, per session (the `modelSelection` projection), and nothing hands them to the model.

This plugin turns those facts into managed environment variables the agent reads on every shell call.

## What it publishes

| Variable | Meaning | Example |
| --- | --- | --- |
| `DSH_DEVICE` | Machine + system + architecture | `mudeMacBook-Air.local (darwin 26.7.1, arm64)` |
| `DSH_APP` | Application + dsh version + profile + URL | `DeepSeek Harness Web GUI (dsh 0.2.0-rc.2, profile web, http://127.0.0.1:3080)` |
| `DSH_PROVIDER` | Provider route | `cline-pass` |
| `DSH_MODEL` | Exact model id | `cline-pass/deepseek-v4.1-flash` |
| `DSH_EFFORT` | Reasoning effort, when present | `high` |

Rule: **a fact that cannot be established is omitted**, never invented. An absent `DSH_MODEL` means "this host publishes no model record", not "the model is unknown".

## Where the values come from

- `DSH_DEVICE`: `node:os` hostname / platform / release plus `process.arch`.
- `DSH_APP`: `DSH_WEB_URL` (present → the Web GUI), `DSH_PROFILE`, and the installed `@deepseek-ai/dsh` version; `DeepSeek Harness` when none of them exist. `config.appLabel` overrides the label.
- `DSH_PROVIDER` / `DSH_MODEL` / `DSH_EFFORT`: the session's durable `modelSelection` projection (`ctx.sessionProjections.snapshot(session, ['modelSelection'])`), reading `lastUsed` — the provider/model of the last committed request header, i.e. what actually served the session.

## Install

```sh
dsh plugin --profile web add link:$PWD
# or, once published: dsh plugin --profile web add dsh-whoami
```

The row is a profile-composition change, so it usually takes effect after a host restart; a `patchReload: live` profile hot-loads it.

## Verify

```sh
env | grep '^DSH_'   # inside any model shell call
```

## Known limitations

- Managed variables only: the host rebuilds the `DSH_*` namespace for every shell call, discarding ambient values.
- The model keys report the **last** request. A model switch made in the UI shows up only after the next request commits.
- A missing or reshaped `sessionProjections` registry omits the model keys silently; the shell call is never affected.
- Nothing is injected into the system prompt and nothing is written to disk, so an agent is not *notified* of a switch — it can simply *look up* the current value every time.

## Security model

Only non-sensitive facts are published: hostname, OS/arch strings, profile name, listen URL, provider/model id, effort. No keys, no tokens, no session content, and nothing is persisted.

---

## 开发日志 / Dev log

跨机改动记录在本机私有库 [DDDMUC/repo-devlogs](https://github.com/DDDMUC/repo-devlogs) 的 `dsh-whoami/` 文件夹；本仓 `AGENTS.md` 写明该约定。

## License

MIT
