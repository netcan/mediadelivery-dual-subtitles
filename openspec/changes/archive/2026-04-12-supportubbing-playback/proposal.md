## Why

当前中文配音链路需要等待整条视频的外挂音轨全部生成完成后，插件才允许启用播放。对于较长视频，这会带来明显的首播等待时间，也让用户在 Provider 已经生成出前几段音频时仍然无法开始收听。现在需要把“整条完成后播放”升级为“按分段逐步可播”，在不引入 ASR 与复杂流媒体协议的前提下，显著降低首帧配音等待时间。

## What Changes

- 将 Python Provider 的任务结果从“只在最终完成时返回单个整段音频”扩展为“生成过程中持续暴露已完成分段与可播放进度”。
- 插件在检测到连续可播放分段达到最小阈值后，提前允许用户启用中文配音，而不必等待整条视频全部生成完成。
- 插件的中文配音播放链路从单一 `audioUrl` 模式扩展为“分段队列 + 预取 + 连续切换”模式，并在目标分段尚未就绪时回退到原声或等待。
- Provider 在分段模式下仍保留任务完成后的整段结果产物，以兼容后续复播、缓存与简单播放路径。
- 首期继续以现有中文字幕驱动配音生成；ASR 仍作为后续扩展预留，不纳入本次变更。

## Capabilities

### New Capabilities
- 无

### Modified Capabilities
- `chinese-dubbing-playback`: 中文配音从“整条完成后可播”升级为“部分分段就绪后可播”，并定义分段播放、预取、回退与启用时机。
- `python-provider-service`: Provider 任务接口与结果结构扩展为支持分段级输出、逐步就绪状态与最终整段产物并存。

## Impact

- 受影响代码：`content.js` 中的任务轮询、中文配音状态管理、外挂音频同步逻辑；`python-provider/app/http_server.py`、`python-provider/app/service.py`、`python-provider/app/job_store.py` 及文件输出组织。
- 受影响接口：`GET /jobs/:id` 返回结构、结果元数据与文件组织方式；`GET /files/:name` 可能扩展为支持按任务目录暴露分段文件。
- 受影响系统：本地 Provider 文件输出策略、插件本地缓存/状态持久化、音频播放编排。
