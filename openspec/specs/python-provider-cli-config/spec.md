# python-provider-cli-config Specification

## Purpose
定义 Python Provider 的命令行启动配置能力，使用户可以通过 CLI 参数设置监听地址、端口和模型路径，并明确 CLI 参数相对环境变量的优先级。

## Requirements

### Requirement: Python provider 必须支持命令行参数配置
系统 MUST 允许用户通过命令行参数启动 Python provider，并覆盖默认运行配置。

#### Scenario: 使用命令行参数设置监听地址与端口
- **WHEN** 用户执行 `python server.py --host 0.0.0.0 --port 8000`
- **THEN** provider MUST 按给定的地址与端口启动服务

#### Scenario: 使用命令行参数设置模型
- **WHEN** 用户执行 `python server.py --model-id openbmb/VoxCPM2`
- **THEN** provider MUST 使用该模型 ID 作为本次启动的模型配置

### Requirement: CLI 参数优先级必须高于环境变量
系统 MUST 在 CLI flags 与环境变量同时存在时，以 CLI flags 作为最终配置值。

#### Scenario: 端口冲突时以 CLI 为准
- **WHEN** 环境变量中配置了一个端口，同时命令行又显式传入另一个端口
- **THEN** provider MUST 使用命令行传入的端口启动
