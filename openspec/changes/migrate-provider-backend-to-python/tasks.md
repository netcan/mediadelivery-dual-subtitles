## 1. Python Provider 服务骨架

- [x] 1.1 新增 Python Provider 目录、启动入口与依赖清单
- [x] 1.2 实现与扩展兼容的 `POST /jobs`、`GET /jobs/:id`、`GET /files/:name`、`GET /health`、`GET /capabilities` 路由
- [x] 1.3 实现任务状态管理、输入校验、能力查询与标准化错误返回

## 2. VoxCPM 模型适配

- [x] 2.1 定义 Python 版本地 TTS 适配器接口，隔离不同模型调用差异
- [x] 2.2 实现 VoxCPM 适配器，支持模型加载、音频生成、音色映射与推理参数配置
- [x] 2.3 在模型调用前接入字幕清洗、分段合并与基础口语化预处理
- [x] 2.4 为模型加载失败、推理失败和无效输出增加标准化失败处理

## 3. 输出结果与扩展联调

- [x] 3.1 实现音频文件与可选字幕文件的本地输出和静态暴露
- [x] 3.2 返回 `audioUrl`、`subtitleUrl`、`segments` 与 `audioOffsetSec` 等最小结果元数据
- [x] 3.3 用当前扩展的自定义 Provider 地址配置完成 Python Provider 的端到端联调，并验证前端仅选择音色的流程
- [x] 3.4 验证异步任务路径稳定可用，并评估是否保留同步模式

## 4. 迁移说明与兼容策略

- [x] 4.1 更新文档，说明 Python 环境准备、VoxCPM 模型安装、Provider 默认配置和音色暴露方式
- [x] 4.2 记录删除 Node Provider、统一到 Python Provider 的推荐使用路径
- [x] 4.3 补充手工验证清单，覆盖任务创建、任务查询、音频播放与失败处理
- [x] 4.4 记录后续扩展项，包括更多 Python TTS 模型、模型预热和资源管理能力
