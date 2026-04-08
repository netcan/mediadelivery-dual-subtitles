## Why

当前分段中文配音已经可以由 Provider 逐步生成，但插件仍尝试让页面中的 `Audio` 元素直接播放远端 `http` 音频 URL。在 `https` 课程页面下，这类跨源音频很容易因为 mixed content 或浏览器安全策略被拦截，导致“中文配音分段已就绪，但浏览器阻止自动播放 / no supported sources”之类问题。现在需要把播放链路改为“扩展后台抓取二进制音频 → 生成 `blob:` URL → 页面播放”，同时通过小窗口缓存控制内存占用。

## What Changes

- 扩展新增对二进制媒体资源的后台抓取能力，用于代理 Provider 返回的分段音频与最终音频文件。
- 中文配音播放链路改为优先播放由扩展生成的 `blob:` URL，而不是让页面直接访问远端 Provider 音频地址。
- 插件为分段播放引入小窗口缓存策略，仅保留当前段、下一段和有限数量的邻近段，并在切段或跳转后及时释放旧 `blob:` 资源。
- 插件在 seek、暂停、继续和分段切换场景下复用同一套 blob 代理播放逻辑，避免整条音轨一次性加载到内存。
- 首期只解决音频资源抓取与播放问题，不改变 Provider 协议，也不引入整条音轨全量缓存。

## Capabilities

### New Capabilities
- `extension-binary-media-proxy`: 扩展后台可抓取二进制媒体资源，并向内容脚本提供可释放的 `blob:` 播放地址与基础缓存控制。

### Modified Capabilities
- `chinese-dubbing-playback`: 中文配音播放必须支持通过扩展代理的 `blob:` 音频源进行分段或完成态播放，并在缓存窗口内控制内存占用与资源释放。

## Impact

- 受影响代码：`background.js` 的消息处理与网络代理逻辑，`content.js` 的分段播放、预取、缓存释放和 `Audio` 源切换逻辑。
- 受影响接口：扩展内部 `chrome.runtime.sendMessage` 消息协议会扩展为支持二进制媒体请求与 `blob:` URL 生命周期管理。
- 受影响系统：页面音频播放链路、浏览器内存使用、分段中文配音联调方式。
