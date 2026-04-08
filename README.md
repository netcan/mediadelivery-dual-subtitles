# MediaDelivery Dual Subtitles

这是一个最小可装载的 Chrome 扩展（Manifest V3），用于在 `MediaDelivery` 播放器 iframe 里显示双语字幕。

相比 Tampermonkey 版，这个扩展更稳：

- 直接作为 Chrome 扩展注入播放器 iframe
- 通过扩展后台读取字幕文件，避免跨域抓取不稳定
- 不在课程主页面注入，降低干扰

## 文件

- `mediadelivery-dual-subtitles/manifest.json`
- `mediadelivery-dual-subtitles/background.js`
- `mediadelivery-dual-subtitles/content.js`

## 安装

1. 打开 Chrome 的 `chrome://extensions/`
2. 打开右上角 `Developer mode`
3. 点击 `Load unpacked`
4. 选择目录 `mediadelivery-dual-subtitles`
5. 确认扩展已启用
6. 打开课程页并播放视频

## 使用

- 视频右上角会出现 `双语字幕` 按钮
- 默认优先选择 `English + Chinese`
- 可在面板里切换主/副字幕
- 可导入本地 `SRT / VTT`
- 可配置自定义 Provider 地址，并为已有中文字幕的视频生成和播放中文配音

## 中文配音（MVP）

当前版本支持在 **英文原声 + 中文字幕** 已存在的前提下：

- 配置配音 Provider 地址
- 读取现有中文字幕及时间轴
- 发起中文配音任务
- 轮询任务状态并加载返回的中文配音音频
- 播放时静音原声并同步播放外挂中文配音
- 继续保留中文字幕显示

### 首期范围

- 首期 **不包含 ASR**
- 首期以 **现有中文字幕** 作为配音输入
- 首期默认采用 **外挂中文音频同步播放**
- 首期推荐使用仓库内置的 **Python VoxCPM Provider**

### Provider 最小契约

扩展默认按以下接口与 Provider 通信：

- `POST <baseURL>/jobs`
- `GET <baseURL>/jobs/:id`
- `GET <baseURL>/capabilities`

创建任务请求体会包含：

- `sourceLanguage`
- `targetLanguage`
- `timingSource`
- `asrEnabled`
- `provider.voicePreset`
- `subtitles.cues[]`

任务结果至少应返回：

- `audioUrl` 或 `dubAudioUrl`
- 可选 `subtitleUrl`
- 可选 `segments`
- 可选 `audioOffsetSec`

创建接口既支持：

- 直接同步返回结果
- 先返回 `jobId` / `pollUrl`，再由状态接口返回结果

Provider 能力接口至少建议返回：

- `provider`
- `defaultVoice`
- `voices[]`

其中 `voices[]` 可以是字符串数组，或包含 `id` / `label` 的对象数组。

## Python VoxCPM Provider

仓库现在内置了一个独立的 Python Provider，路径为 `python-provider/`，推荐作为当前主路径使用。

### 当前实现形态

- 扩展仍然调用 `POST /jobs`、`GET /jobs/:id`
- Provider 新增 `GET /capabilities`，用于给前端返回可选音色
- Python Provider 负责接收中文字幕时间轴、预处理文案、调用 VoxCPM，并按分段逐步输出外挂中文音频
- 默认走异步任务模式；如需同步返回，可设置 `PYTHON_PROVIDER_RESPONSE_MODE=sync` 或启动时传 `--response-mode sync`
- 输出文件默认写到 `python-provider/output/`
- 模型、模型路径和推理参数由 Provider 内部管理
- 插件前端只保留 `Provider 地址` 和 `音色` 两类关键配置

### 推荐运行环境

- `Python 3.10+`
- 推荐安装官方 `voxcpm` PyPI 包
- 首期默认模型为 `openbmb/VoxCPM2`

### 安装 VoxCPM

根据 VoxCPM 官方 README，最直接的安装方式是：

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install -U pip
python3 -m pip install -r python-provider/requirements.txt
```

官方 README 目前提供了：

- `pip install voxcpm`
- 运行时首次自动下载模型，或提前下载 `openbmb/VoxCPM1.5` / `openbmb/VoxCPM-0.5B`

如果你想显式指定模型，可通过命令行参数或环境变量覆盖。

### 启动 Python Provider

推荐直接用命令行参数启动，跨平台更直观：

```bash
python3 python-provider/server.py --host 127.0.0.1 --port 8000 --model-id openbmb/VoxCPM2
```

如果你习惯走 `npm script`，也可以把参数透传给 Python 入口：

```bash
npm run provider:start -- --host 127.0.0.1 --port 8000 --model-id openbmb/VoxCPM2
```

常用 CLI 参数：

- `--host`：监听地址，默认 `127.0.0.1`
- `--port`：Provider 端口，默认 `8000`
- `--base-url`：对外暴露的 Base URL，可选
- `--response-mode`：`async` 或 `sync`
- `--model-id`：VoxCPM 模型名，默认 `openbmb/VoxCPM2`
- `--default-voice`：默认音色 ID
- `--cfg-value`：默认 `cfg_value`
- `--inference-timesteps`：默认 `inference_timesteps`
- `--output-dir`：输出目录
- `--load-denoiser` / `--no-load-denoiser`
- `--preload-model` / `--no-preload-model`：默认会预加载，如需关闭可显式传 `--no-preload-model`
- `--enable-mock` / `--no-enable-mock`

说明：

- CLI flags 优先级高于环境变量
- 未显式传入的参数，仍会回退到环境变量或内置默认值
- 若想让局域网设备访问 Provider，可把 `--host` 改为 `0.0.0.0`

环境变量模式仍然保留，适合长期固定配置，例如：

```bash
export VOXCPM_MODEL_ID=openbmb/VoxCPM2
PYTHON_PROVIDER_PORT=8000 \
npm run provider:start
```

常用环境变量：

- `PYTHON_PROVIDER_HOST`：监听地址，默认 `127.0.0.1`
- `PYTHON_PROVIDER_PORT`：Provider 端口，默认 `8000`
- `PYTHON_PROVIDER_BASE_URL`：对外暴露的 Base URL，可选
- `PYTHON_PROVIDER_RESPONSE_MODE`：`async` 或 `sync`
- `VOXCPM_MODEL_ID`：VoxCPM 模型名，默认 `openbmb/VoxCPM2`
- `VOXCPM_LOAD_DENOISER`：是否加载降噪器
- `VOXCPM_CFG_VALUE`：默认 `cfg_value`
- `VOXCPM_INFERENCE_TIMESTEPS`：默认 `inference_timesteps`
- `VOXCPM_DEFAULT_VOICE`：默认音色 ID
- `VOXCPM_VOICE_PRESETS_JSON`：可选音色配置 JSON
- `VOXCPM_PRELOAD_MODEL`：是否在启动时预热模型，默认开启

示例音色配置：

```bash
export VOXCPM_VOICE_PRESETS_JSON='{"default":{"label":"默认音色"},"warm":{"label":"温和","cfg_value":2.2,"inference_timesteps":12}}'
```

### 在扩展中如何配置

在扩展面板里建议这样填：

- `Provider 地址`：`http://127.0.0.1:8000`
- 点击 `读取音色`
- 从下拉框中选择一个 Provider 暴露的音色

说明：

- 当前首期链路使用 **现有中文字幕** 直接驱动配音
- 服务会在 TTS 前做基础清洗与轻量口语化预处理，并把相邻短字幕合并，减少“逐字念字幕”的机械感
- Provider 运行中会逐步返回已完成分段与可播放进度；任务完成后仍会返回最终整段 `audioUrl`
- 输出结果会返回 `audioUrl`、`subtitleUrl`、`segments` 和 `audioOffsetSec`
- 未选择音色时，Provider 会回退到默认音色
- 插件仍允许你填自定义 IP / 端口 / Base URL，以便连接本机或局域网中的 Provider
- 当前插件会在前几段中文配音已就绪后允许提前启用播放；若跳转到尚未生成的位置，会暂时回退到原声或等待后续分段完成

### 开发联调

仓库自带一个本地 smoke test：

```bash
npm run provider:smoke
```

它默认会连续验证两种启动方式：

- 环境变量启动
- CLI 参数启动（同时校验 CLI 覆盖环境变量）

它会：

- 启动真实的 `python-provider`
- 使用 mock 模式模拟 VoxCPM 输出
- 请求 `GET /capabilities`
- 发送与扩展一致的 `POST /jobs` 请求
- 轮询 `GET /jobs/:id`
- 校验最终 `audioUrl`、分段 `audioUrl`、`subtitleUrl` 和音频 `Range` 访问

如果你只想单独验证一种方式，也可以这样运行：

```bash
python3 python-provider/scripts/smoke_test.py --startup-mode cli
python3 python-provider/scripts/smoke_test.py --startup-mode env
```

## 手工验证清单

- 打开带英文字幕和中文字幕轨的 MediaDelivery 视频
- 确认 `双语字幕` 面板仍可正常切换主/副字幕
- 启动 Python Provider，并先访问 `http://127.0.0.1:8000/health` 确认服务在线
- 在扩展中填写自定义 Provider 地址
- 点击 `读取音色`，确认能拿到 `GET /capabilities` 返回的音色列表
- 点击 `生成中文配音`，确认面板能显示排队、处理中、成功或失败状态
- 确认 `python-provider/output/` 中生成了分段 `.wav`、最终 `.wav` 与 `.vtt`
- 当前几段中文配音就绪后尝试启用 `中文配音`，确认无需等待整条视频全部生成完成
- 任务完成后继续播放 `中文配音`，确认视频原声被静音且中文配音与播放进度同步
- 手动执行暂停、继续、跳转、倍速切换，确认外挂中文音频能够跟随同步
- 手动跳转到一个尚未生成完成的位置，确认会回退到原声或等待，而不是一直卡在静音状态
- 若 Provider 返回 `subtitleUrl`，确认仍至少存在一条可用中文字幕路径
- 故意让 VoxCPM 环境不可用后再次创建任务，确认能看到“模型加载失败 / 初始化失败”类错误
- 关闭 `中文配音`，确认可以恢复原视频默认音频行为

## 后续扩展点

- `ASR`：为没有现成字幕或需要更细粒度时间轴的场景补充转写能力
- 更多 Python TTS 适配器：如 Fish Speech、MeloTTS、GPT-SoVITS
- 本地 LLM 配音稿改写：让字幕更接近日常口语表达
- 说话人分离：支持多人对话场景的角色区分
- 模型预热与资源管理：避免首次请求延迟过高
- 更细粒度时间对齐：减少长时播放时的音频漂移
- 配音稿字幕切换：允许在原中文字幕与配音生成字幕之间切换
- 混音模式：支持原声压低而非完全静音

## 说明

- 这个扩展只匹配 `https://iframe.mediadelivery.net/embed/*`
- 对使用标准 `video + track + VTT` 的 MediaDelivery 嵌入页有较好的通用性
- 为了支持自定义 Provider 与本地服务，当前版本声明了更宽的网络访问权限
