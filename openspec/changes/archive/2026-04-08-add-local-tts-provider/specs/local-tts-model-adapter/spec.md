## ADDED Requirements

### Requirement: 系统必须支持本地 TTS 模型适配层
系统 MUST 在本地 Provider 服务内部定义可替换的模型适配层，以隔离不同本地 TTS 模型的调用差异。

#### Scenario: 选择推荐模型适配器
- **WHEN** 用户将扩展中的 TTS 模型参数配置为首期支持的本地模型
- **THEN** 服务 MUST 能将该模型参数映射到对应的本地适配器实现

#### Scenario: 后续新增模型
- **WHEN** 开发者需要接入新的本地 TTS 模型
- **THEN** 系统 MUST 允许通过新增适配器扩展支持范围，而无需修改任务 API 契约

### Requirement: 首期必须优先支持 CosyVoice 风格的本地接入
系统 MUST 将 CosyVoice 风格的本地部署方式作为首期优先支持路径，并为其准备明确的调用与配置入口。

#### Scenario: 使用 CosyVoice 风格模型
- **WHEN** 用户按推荐方式部署 CosyVoice 风格模型并启动本地 Provider
- **THEN** 服务 MUST 能调用该模型完成中文配音生成

#### Scenario: 模型调用失败
- **WHEN** CosyVoice 风格模型返回错误或生成失败
- **THEN** 服务 MUST 将该失败传递为标准化任务错误，而不是让请求静默失败

### Requirement: 模型适配层必须允许字幕驱动的预处理
系统 MUST 在调用本地 TTS 模型前支持字幕清洗与配音稿预处理步骤，以改善首期配音自然度。

#### Scenario: 执行基础文本预处理
- **WHEN** 服务接收到字幕分段任务
- **THEN** 服务 MUST 在调用模型前允许对文本做基础清洗、分句或口语化预处理

#### Scenario: 预处理失败
- **WHEN** 字幕预处理阶段发生错误
- **THEN** 服务 MUST 明确返回预处理失败，而不是继续生成无效音频
