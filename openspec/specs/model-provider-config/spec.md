## Requirements

### Requirement: 用户可以配置模型服务提供方
系统 MUST 允许用户配置用于中文配音任务的模型服务提供方，并保存必要的连接与模型参数。

#### Scenario: 配置自定义服务
- **WHEN** 用户选择自定义 Provider
- **THEN** 扩展 MUST 允许填写 `baseURL`、认证信息和模型相关参数并持久化保存

#### Scenario: 配置本地服务
- **WHEN** 用户选择 `localhost` 或其他本地服务地址作为 Provider
- **THEN** 扩展 MUST 将其视为合法 Provider 配置类型，并按同一抽象保存配置

### Requirement: Provider 配置须支持多种接口风格
系统 MUST 支持云端 API、自定义 HTTP API、本地服务和 OpenAI-compatible 接口等多种 Provider 类型，而不将请求格式硬编码为单一厂商。

#### Scenario: 使用 OpenAI-compatible 服务
- **WHEN** 用户提供兼容 OpenAI 风格的 `baseURL`、`apiKey` 和模型名称
- **THEN** 扩展 MUST 能以统一 Provider 配置结构保存并在任务请求中传递这些参数

#### Scenario: 切换 Provider 类型
- **WHEN** 用户在设置中切换不同 Provider 类型
- **THEN** 扩展 MUST 保持通用配置字段的一致性，并避免要求用户进入厂商特定流程才能保存配置

### Requirement: 无效 Provider 配置不得进入任务执行
系统 MUST 在任务发起前对必要的 Provider 配置进行校验，并在配置缺失或明显无效时阻止任务执行。

#### Scenario: 缺少关键配置
- **WHEN** 用户未提供任务所需的关键字段，例如 `baseURL`、认证信息或必要模型名称
- **THEN** 扩展 MUST 阻止发起中文配音任务，并提示缺失项

#### Scenario: Provider 请求返回认证或连接错误
- **WHEN** 扩展在任务创建或状态查询时收到连接错误、超时或认证失败
- **THEN** 扩展 MUST 将错误归因到 Provider 配置或服务可达性，并向用户展示可操作的提示
