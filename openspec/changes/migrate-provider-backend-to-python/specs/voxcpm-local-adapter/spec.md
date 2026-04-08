## ADDED Requirements

### Requirement: 系统必须支持 VoxCPM 原生 Python SDK 适配
系统 MUST 在 Python Provider 内部提供 VoxCPM 适配器，并通过原生 Python SDK 完成模型加载与语音生成。

#### Scenario: 加载 VoxCPM 模型
- **WHEN** Provider 启动或首次收到 VoxCPM 配音任务
- **THEN** 系统 MUST 能使用 `VoxCPM.from_pretrained(...)` 或等价方式加载模型

#### Scenario: 生成中文配音音频
- **WHEN** Python Provider 向 VoxCPM 适配器提交清洗后的中文文本
- **THEN** 适配器 MUST 调用 `generate(...)` 或等价接口返回可写入文件的音频数据

#### Scenario: 按音色生成语音
- **WHEN** 插件前端为任务选择了一个 Provider 支持的音色
- **THEN** 适配器 MUST 使用该音色对应的配置生成中文语音

### Requirement: VoxCPM 适配器必须支持可配置的推理参数
系统 MUST 允许通过 Provider 配置或服务配置向 VoxCPM 传递基础推理参数，以便在自然度、速度和资源占用之间平衡；这些参数 SHOULD 由 Provider 统一维护，而不是由插件前端直接暴露。

#### Scenario: 使用默认推理参数
- **WHEN** 用户未显式配置 VoxCPM 推理参数
- **THEN** 系统 MUST 使用一组稳定的默认参数完成合成

#### Scenario: 覆盖推理参数
- **WHEN** 服务配置中指定了如 `cfg_value`、`inference_timesteps` 等参数
- **THEN** 适配器 MUST 在模型调用时应用这些参数

### Requirement: VoxCPM 适配器必须传递标准化失败结果
系统 MUST 在 VoxCPM 模型加载失败、推理失败或输出无效时返回标准化任务错误。

#### Scenario: 模型加载失败
- **WHEN** 模型权重不存在、依赖缺失或显存不足导致初始化失败
- **THEN** 服务 MUST 返回可解释的失败状态，并标记为模型初始化问题

#### Scenario: 推理输出无效
- **WHEN** VoxCPM 返回空音频、损坏音频或非预期数据结构
- **THEN** 服务 MUST 将任务标记为失败，并返回输出无效错误
