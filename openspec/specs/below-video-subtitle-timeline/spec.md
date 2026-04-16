# below-video-subtitle-timeline Specification

## Purpose
TBD - created by archiving change add-below-video-subtitle-timeline. Update Purpose after archive.
## Requirements
### Requirement: User can view subtitle timeline below the video in non-fullscreen mode
系统 MUST 在非全屏播放场景下，在视频区域下方提供一个外置双语字幕时间轴，以便用户在不遮挡视频画面的前提下浏览字幕上下文。

#### Scenario: External timeline appears below video
- **WHEN** 页面存在可用视频且用户处于非全屏模式
- **THEN** 系统 MUST 在视频容器下方渲染外置字幕时间轴区域

#### Scenario: External timeline is hidden in fullscreen
- **WHEN** 用户进入全屏播放
- **THEN** 系统 MUST 隐藏视频下方的外置字幕时间轴区域

### Requirement: External subtitle timeline stays synchronized with playback state
系统 MUST 让外置字幕时间轴与当前播放时间保持同步，包括当前字幕高亮、恢复播放点后的定位，以及点击字幕后的跳转反馈。

#### Scenario: Active subtitle follows playback
- **WHEN** 视频播放时间推进到新的字幕条目
- **THEN** 系统 MUST 在外置时间轴中高亮对应条目

#### Scenario: Restored playback position updates external timeline
- **WHEN** 页面刷新后视频恢复到已保存的播放位置
- **THEN** 系统 MUST 让外置时间轴定位到该播放时间对应的字幕条目

#### Scenario: Clicking external timeline seeks video
- **WHEN** 用户点击外置时间轴中的某条字幕
- **THEN** 系统 MUST 将视频跳转到该字幕对应的时间点

### Requirement: External subtitle timeline supports manual browsing and current-position relocation
系统 MUST 允许用户在宿主页悬浮字幕时间轴中手动滚动浏览字幕，同时提供回到当前播放位置、管理选中字幕、触发图片分享和导出 TXT 的快捷能力。

#### Scenario: Paused playback does not interrupt manual browsing
- **WHEN** 视频处于暂停状态且用户手动滚动外置时间轴
- **THEN** 系统 MUST 不自动将外置时间轴滚回当前字幕位置

#### Scenario: User can relocate to current subtitle
- **WHEN** 用户点击外置时间轴中的“定位当前”操作
- **THEN** 系统 MUST 将外置时间轴滚动到当前播放时间对应的字幕条目附近

#### Scenario: User can access selection and sharing actions
- **WHEN** 用户打开宿主页悬浮字幕时间轴窗口
- **THEN** 系统 MUST 提供与字幕选择、图片分享和 TXT 导出相关的可见操作入口
