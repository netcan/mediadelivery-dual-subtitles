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

## 说明

- 这个扩展只匹配 `https://iframe.mediadelivery.net/embed/*`
- 对使用标准 `video + track + VTT` 的 MediaDelivery 嵌入页有较好的通用性
