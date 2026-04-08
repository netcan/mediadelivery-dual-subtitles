## Why

当前本地 Provider 以后端 Node.js 为主，虽然已经打通了扩展契约，但接入真实本地 TTS 模型时仍需要额外适配 HTTP 网关。对于 VoxCPM 这类原生提供 Python 推理接口的模型，若继续坚持 Node 主后端，会增加进程编排、接口转换和维护成本，因此需要把 Provider 后端迁移到 Python 优先的实现路径，并把大部分模型配置下沉到 Provider 内部统一管理。

## What Changes

- 新增 Python 版本地 Provider 服务，实现与扩展兼容的 `POST /jobs`、`GET /jobs/:id`、静态文件输出、健康检查，以及能力查询接口。
- 新增 VoxCPM 专用的本地 TTS 适配路径，支持直接通过 Python SDK 加载模型并生成中文配音音频。
- 将模型、默认推理参数和运行配置下沉到 Provider，由 Provider 统一管理，不再要求插件前端暴露完整模型配置。
- 保留 Provider 地址配置作为插件侧可配置项，允许用户填写 Provider 的 IP / 端口 / Base URL。
- 保留音色选择作为插件侧可配置项，由 Provider 暴露可选音色列表给前端使用。
- 调整本地部署文档与运行说明，明确 Python 环境、VoxCPM 模型准备方式、Provider 配置方式以及扩展侧最小化接入方式。
- 移除旧的 Node.js 本地 Provider 实现，统一收敛到 Python Provider 主路径。

## Capabilities

### New Capabilities
- `python-provider-service`: 提供 Python 版本地 Provider 服务，对扩展暴露统一任务接口与文件输出能力。
- `voxcpm-local-adapter`: 提供 VoxCPM 原生 Python SDK 适配能力，支持直接模型加载与音频生成。

### Modified Capabilities
- `local-tts-provider-service`: 将本地 Provider 的推荐后端从 Node 迁移为 Python，并补充 Provider 管理模型配置、前端可配置 Provider 地址且仅选择音色的要求。
- `local-tts-model-adapter`: 将本地模型适配层收敛为 VoxCPM 优先路径，并要求模型参数主要由 Provider 内部管理。

## Impact

- 影响本地 Provider 服务目录结构、启动方式和部署文档。
- 影响模型接入方式：从“HTTP 网关转发”迁移为“Python 进程内直接调用 VoxCPM SDK / 模型”。
- 影响插件侧配置边界：前端继续允许配置 Provider 地址，不再直接暴露完整模型参数，但仍可选择 Provider 暴露出的音色。
- 影响仓库目录结构：删除旧的 Node.js Provider，统一使用 `python-provider/`。
