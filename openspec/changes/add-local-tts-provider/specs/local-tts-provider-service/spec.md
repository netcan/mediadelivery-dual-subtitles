## ADDED Requirements

### Requirement: 本地 Provider 服务必须暴露扩展兼容的任务接口
系统 MUST 在本机提供与扩展当前契约兼容的 HTTP 接口，以接收中文配音任务并返回任务状态或结果。

#### Scenario: 创建本地配音任务
- **WHEN** 扩展向本地服务发送 `POST /jobs` 请求并附带字幕分段、模型参数和配音元数据
- **THEN** 服务 MUST 返回可用于后续获取结果的任务信息或直接返回完成结果

#### Scenario: 查询任务状态
- **WHEN** 扩展向本地服务发送 `GET /jobs/:id`
- **THEN** 服务 MUST 返回标准化的任务状态，并在完成时包含配音结果

### Requirement: 本地 Provider 服务必须输出扩展可消费的结果结构
系统 MUST 在任务完成时返回至少包含音频 URL 的结果结构，并允许附带字幕 URL 与最小元数据。

#### Scenario: 任务成功完成
- **WHEN** 本地 TTS 处理成功
- **THEN** 服务 MUST 返回 `audioUrl` 或等价字段，并保证扩展能够据此播放中文配音

#### Scenario: 返回附加元数据
- **WHEN** 服务生成了字幕文件或时间偏移信息
- **THEN** 服务 MUST 允许在结果中包含 `subtitleUrl`、`segments` 或 `audioOffsetSec`

### Requirement: 本地 Provider 服务必须能处理失败状态
系统 MUST 在本地模型不可用、推理失败或输入无效时返回可解释的错误状态。

#### Scenario: 模型未就绪
- **WHEN** 用户尚未正确部署本地模型或模型进程不可访问
- **THEN** 服务 MUST 返回失败状态，并说明是本地模型不可用

#### Scenario: 输入字幕无效
- **WHEN** 扩展提交的字幕为空或缺少必要时间轴
- **THEN** 服务 MUST 拒绝处理该任务，并返回输入错误信息
