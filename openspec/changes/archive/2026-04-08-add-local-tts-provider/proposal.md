## Why

当前扩展已经具备中文配音任务入口和 Provider 抽象，但还没有可实际运行的本地 Provider 服务，导致“生成中文配音”只能停留在接口层。优先接入本地部署 TTS 模型，可以在不依赖外部云服务的情况下打通真实配音链路，同时为后续接入更强模型和自定义部署方案打下基础。

## What Changes

- 新增本地 Provider 服务：提供扩展可调用的 `POST /jobs` 与 `GET /jobs/:id` 接口，并返回符合当前扩展预期的任务状态与结果结构。
- 新增本地 TTS 模型适配：优先支持本地部署的 TTS 模型，首选围绕 CosyVoice 设计可替换的模型适配层。
- 新增本地音频结果管理：本地 Provider 负责输出中文配音音频文件、可选字幕文件和最小元数据，并以本地可访问 URL 提供给扩展播放。
- 新增本地部署文档与运行说明：明确模型准备、服务启动、扩展配置方式以及首期限制。
- 明确首期范围：本次聚焦“本地 TTS Provider + 扩展联调”，不实现 ASR、多人说话人分离或复杂混音。

## Capabilities

### New Capabilities
- `local-tts-provider-service`: 在本机启动可供扩展调用的 Provider 服务，接收字幕驱动的配音任务并返回标准化结果。
- `local-tts-model-adapter`: 以本地部署 TTS 模型为核心实现可插拔模型适配层，首期优先支持 CosyVoice 风格的接入方式。

### Modified Capabilities
- 无

## Impact

- 影响仓库结构：除扩展代码外，需要新增本地 Provider 服务端代码与运行脚本。
- 影响扩展使用方式：用户需要本地启动 Provider 服务，并在扩展面板中配置 `localhost` 地址与模型参数。
- 影响文档与验证流程：需要补充模型准备、服务启动、文件输出与联调验证说明。
- 为后续接入更多本地 TTS 模型、云端回退 Provider 或 ASR 增强保留扩展空间。
