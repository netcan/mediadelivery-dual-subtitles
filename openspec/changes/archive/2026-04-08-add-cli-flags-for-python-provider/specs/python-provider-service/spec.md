## MODIFIED Requirements

### Requirement: Python Provider 服务必须管理模型与默认推理配置
系统 MUST 由 Provider 内部统一管理模型、模型路径和默认推理参数，而不是要求插件前端直接提交完整模型配置；这些默认配置 MUST 同时支持环境变量与命令行参数两种加载方式。

#### Scenario: 使用 Provider 默认模型
- **WHEN** 插件前端创建配音任务且未显式覆盖模型参数
- **THEN** 服务 MUST 使用 Provider 当前配置的默认 VoxCPM 模型与默认推理参数处理任务

#### Scenario: 前端仅选择音色
- **WHEN** 插件前端在创建任务时传递所选音色
- **THEN** 服务 MUST 将该音色映射到 Provider 支持的 VoxCPM 音色配置，并继续使用 Provider 内部管理的其他模型参数

#### Scenario: 命令行参数覆盖默认配置
- **WHEN** 用户通过命令行参数指定模型或运行参数后启动 Provider
- **THEN** 服务 MUST 使用命令行参数覆盖环境变量或内置默认值
