## Context

Python provider 已经承担本地配音主路径，但当前运行配置主要由环境变量驱动。对于直接在 PowerShell、CMD 或 bash 中启动服务的用户来说，环境变量方式较为冗长，也不利于快速试错。相比之下，命令行参数更符合“单次启动时覆盖配置”的使用习惯。

本次变更聚焦于为 Python provider 增加 CLI flags，同时保持现有环境变量兼容。目标是在不改变 provider HTTP 行为的前提下，让启动方式更直观、文档更清晰。

## Goals / Non-Goals

**Goals:**
- 让 Python provider 支持命令行参数方式启动。
- 明确 CLI flags 与环境变量的优先级。
- 保持现有 HTTP 接口和运行行为兼容。
- 更新 README，给出跨平台更直观的启动示例。

**Non-Goals:**
- 不修改扩展协议或前端配置逻辑。
- 不在本次变更中引入复杂配置文件格式。
- 不移除现有环境变量支持。

## Decisions

### 决策 1：采用“CLI flags 覆盖环境变量”的加载顺序
启动时先读取环境变量默认值，再用命令行参数覆盖。

**原因：**
- 保持现有部署兼容。
- 对临时调试最友好。

### 决策 2：仅暴露高频配置项为 flags
优先支持 `host`、`port`、`base-url`、`response-mode`、`model-id`、`default-voice`、`cfg-value`、`inference-timesteps` 等常用参数。

**原因：**
- 覆盖最常见的手工启动需求。
- 避免 CLI 参数过多难以维护。

### 决策 3：入口脚本直接负责解析参数
由 `python-provider/server.py` 或相邻模块负责命令行参数解析，再把结果传入现有配置加载逻辑。

**原因：**
- 改动集中，用户使用路径清晰。
- 不需要新增额外启动器脚本。

## Risks / Trade-offs

- [CLI 参数与环境变量冲突] → 明确文档和实现中 CLI 优先。
- [参数过多增加维护成本] → 首期仅保留常用项，其他继续走环境变量。
- [Windows / Linux 示例差异] → README 中统一优先展示 CLI 启动方式。

## Migration Plan

1. 为 Python provider 增加参数解析器。
2. 将配置加载重构为“环境变量默认值 + CLI 覆盖”。
3. 更新 README 启动示例。
4. 增加基础验证，确保 CLI 与环境变量两种方式都可用。

## Open Questions

- 是否需要首期就支持通过 CLI 传入音色 JSON 配置文件路径？
