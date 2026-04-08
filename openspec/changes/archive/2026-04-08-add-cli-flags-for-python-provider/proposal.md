## Why

当前 Python provider 的启动配置主要依赖环境变量，这在本地命令行直接启动时不够直观，也不利于快速切换端口、模型和运行模式。为降低启动门槛并提升可维护性，需要让 Python provider 支持显式的命令行参数，同时保留环境变量作为兜底来源。

## What Changes

- 为 Python provider 新增命令行参数解析入口，支持通过 `python server.py --host ... --port ...` 方式启动。
- 将常用配置项（监听地址、端口、模型名、响应模式、默认音色等）暴露为 CLI flags。
- 约定 CLI flags 优先级高于环境变量，环境变量继续作为默认值来源。
- 更新文档与启动示例，优先展示命令行参数方式。

## Capabilities

### New Capabilities
- `python-provider-cli-config`: 提供 Python provider 的命令行参数配置能力，支持启动时覆盖默认配置。

### Modified Capabilities
- `python-provider-service`: 扩展 Python provider 的配置加载方式，使其支持 CLI flags 与环境变量共存。

## Impact

- 影响 `python-provider` 的配置加载与启动入口。
- 影响 README 中的启动文档与示例命令。
- 不影响扩展侧 HTTP 契约，也不影响前端 UI。
