## MODIFIED Requirements

### Requirement: Python Provider 服务必须暴露扩展兼容的任务接口
系统 MUST 提供 Python 实现的本地 Provider 服务，并继续向扩展暴露兼容的 `POST /jobs`、`GET /jobs/:id`、`GET /files/:name`、`GET /health` 与能力查询接口；对于长时中文配音任务，服务 MUST 支持在任务执行过程中返回已完成分段、连续可播放进度与最终完成态结果。

#### Scenario: 创建配音任务
- **WHEN** 扩展向 Python Provider 发送 `POST /jobs` 请求并附带字幕分段、模型参数和配音元数据
- **THEN** 服务 MUST 返回任务信息或直接返回完成结果，且字段结构与扩展当前契约兼容

#### Scenario: 查询部分可播结果
- **WHEN** 扩展向 Python Provider 发送 `GET /jobs/:id` 且任务仍在执行中
- **THEN** 服务 MUST 返回标准化任务状态，并在有可播放分段时附带已完成分段列表、连续可播放范围或等价进度信息

#### Scenario: 查询最终结果
- **WHEN** 扩展向 Python Provider 发送 `GET /jobs/:id` 且任务已完成
- **THEN** 服务 MUST 返回标准化任务状态，并在完成时包含最终整段配音结果以及可选的分段元数据

#### Scenario: 查询 Provider 能力
- **WHEN** 插件前端需要读取当前 Provider 可选配置
- **THEN** 服务 MUST 返回能力信息，并至少包含可选音色列表与默认音色

### Requirement: Python Provider 服务必须输出可直接访问的结果文件
系统 MUST 将生成的音频与可选字幕写入本地输出目录，并通过 HTTP 静态路径暴露给扩展消费；在分段播放模式下，服务 MUST 允许任务在执行过程中逐步输出并暴露分段音频文件，同时在任务完成后保留最终整段结果或等价完成态资源。

#### Scenario: 输出分段音频文件
- **WHEN** Python Provider 成功生成某个中文配音分段
- **THEN** 服务 MUST 立即为该分段生成可访问的文件地址或等价可消费资源，并将其反映到任务状态结果中

#### Scenario: 输出附加文件与元数据
- **WHEN** 服务生成了字幕文件、时间对齐信息或分段播放元数据
- **THEN** 服务 MUST 允许在结果中包含 `subtitleUrl`、`segments`、`audioOffsetSec`、连续可播放进度或等价字段

#### Scenario: 输出最终整段结果
- **WHEN** 服务完成全部分段生成并完成最终拼接或整理
- **THEN** 服务 MUST 返回可访问的最终 `audioUrl` 或等价字段，以便扩展在完成态使用单资源播放或缓存
