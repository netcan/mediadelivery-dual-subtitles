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
- 可配置自定义 Provider，为已有中文字幕的视频生成并播放中文配音

## 中文配音（MVP）

当前版本支持在 **英文原声 + 中文字幕** 已存在的前提下：

- 配置配音 Provider（云端 API / 自定义 HTTP API / OpenAI-compatible / `localhost`）
- 读取现有中文字幕及时间轴
- 发起中文配音任务
- 轮询任务状态并加载返回的中文配音音频
- 播放时静音原声并同步播放外挂中文配音
- 继续保留中文字幕显示

### 首期范围

- 首期 **不包含 ASR**
- 首期以 **现有中文字幕** 作为配音输入
- 首期默认采用 **外挂中文音频同步播放**

### Provider 最小契约

扩展默认按以下接口与 Provider 通信：

- `POST <baseURL>/jobs`
- `GET <baseURL>/jobs/:id`

创建任务请求体会包含：

- `sourceLanguage`
- `targetLanguage`
- `timingSource`
- `asrEnabled`
- `provider.translationModel`
- `provider.ttsModel`
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

### Provider 配置建议

- `custom`：适合你自定义的 HTTP 服务
- `openai-compatible`：适合兼容 OpenAI 风格的聚合或私有服务
- `localhost`：适合本机启动的 ASR / 翻译 / TTS 网关
- `cloud`：适合托管的线上服务

如果 Provider 类型为 `cloud` 或 `openai-compatible`，扩展会要求填写 `API Key / Token`。

## 手工验证清单

- 打开带英文字幕和中文字幕轨的 MediaDelivery 视频
- 确认 `双语字幕` 面板仍可正常切换主/副字幕
- 配置一个可用的 Provider，并保存 `baseURL`、模型名和鉴权信息
- 点击 `生成中文配音`，确认面板能显示排队、处理中、成功或失败状态
- 任务完成后启用 `中文配音`，确认视频原声被静音且中文配音与播放进度同步
- 手动执行暂停、继续、跳转、倍速切换，确认外挂中文音频能够跟随同步
- 若 Provider 返回 `subtitleUrl`，确认仍至少存在一条可用中文字幕路径
- 关闭 `中文配音`，确认可以恢复原视频默认音频行为

## 后续扩展点

- `ASR`：为没有现成字幕或需要更细粒度时间轴的场景补充转写能力
- 说话人分离：支持多人对话场景的角色区分
- 更细粒度时间对齐：减少长时播放时的音频漂移
- 配音稿字幕切换：允许在原中文字幕与配音生成字幕之间切换
- 混音模式：支持原声压低而非完全静音

## 说明

- 这个扩展只匹配 `https://iframe.mediadelivery.net/embed/*`
- 对使用标准 `video + track + VTT` 的 MediaDelivery 嵌入页有较好的通用性
- 为了支持自定义 Provider 与本地服务，当前版本声明了更宽的网络访问权限
