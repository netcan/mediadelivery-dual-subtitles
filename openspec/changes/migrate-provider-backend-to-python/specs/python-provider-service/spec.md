## ADDED Requirements

### Requirement: Python Provider 服务必须暴露扩展兼容的任务接口
系统 MUST 提供 Python 实现的本地 Provider 服务，并继续向扩展暴露兼容的 `POST /jobs`、`GET /jobs/:id`、`GET /files/:name`、`GET /health` 与能力查询接口。

#### Scenario: 创建配音任务
- **WHEN** 扩展向 Python Provider 发送 `POST /jobs` 请求并附带字幕分段、模型参数和配音元数据
- **THEN** 服务 MUST 返回任务信息或直接返回完成结果，且字段结构与扩展当前契约兼容

#### Scenario: 查询任务结果
- **WHEN** 扩展向 Python Provider 发送 `GET /jobs/:id`
- **THEN** 服务 MUST 返回标准化任务状态，并在完成时包含配音结果

#### Scenario: 查询 Provider 能力
- **WHEN** 插件前端需要读取当前 Provider 可选配置
- **THEN** 服务 MUST 返回能力信息，并至少包含可选音色列表与默认音色

### Requirement: Python Provider 服务必须管理模型与默认推理配置
系统 MUST 由 Provider 内部统一管理模型、模型路径和默认推理参数，而不是要求插件前端直接提交完整模型配置。

#### Scenario: 使用 Provider 默认模型
- **WHEN** 插件前端创建配音任务且未显式覆盖模型参数
- **THEN** 服务 MUST 使用 Provider 当前配置的默认 VoxCPM 模型与默认推理参数处理任务

#### Scenario: 前端仅选择音色
- **WHEN** 插件前端在创建任务时传递所选音色
- **THEN** 服务 MUST 将该音色映射到 Provider 支持的 VoxCPM 音色配置，并继续使用 Provider 内部管理的其他模型参数

### Requirement: 插件前端必须允许配置 Provider 地址
系统 MUST 允许插件前端配置 Provider 的 IP / 端口 / Base URL，以便连接不同部署位置的 Python Provider。

#### Scenario: 使用自定义 Provider 地址
- **WHEN** 用户在插件中填写自定义 Provider 地址
- **THEN** 插件 MUST 使用该地址访问 `POST /jobs`、`GET /jobs/:id` 与能力查询接口

### Requirement: Python Provider 服务必须输出可直接访问的结果文件
系统 MUST 将生成的音频与可选字幕写入本地输出目录，并通过 HTTP 静态路径暴露给扩展消费。

#### Scenario: 输出音频文件
- **WHEN** Python Provider 成功生成中文配音
- **THEN** 服务 MUST 返回可访问的 `audioUrl` 或等价字段

#### Scenario: 输出附加文件与元数据
- **WHEN** 服务生成了字幕文件或时间对齐信息
- **THEN** 服务 MUST 允许在结果中包含 `subtitleUrl`、`segments` 与 `audioOffsetSec`

### Requirement: Python Provider 服务必须返回可解释的失败状态
系统 MUST 在输入无效、模型不可用或推理失败时返回标准化错误，而不是静默失败。

#### Scenario: 输入字幕无效
- **WHEN** 扩展提交的字幕为空或缺少必要时间轴
- **THEN** 服务 MUST 拒绝任务并返回输入错误信息

#### Scenario: 模型不可用
- **WHEN** Python Provider 无法加载目标模型或运行时环境异常
- **THEN** 服务 MUST 返回失败状态，并说明是模型不可用或初始化失败
