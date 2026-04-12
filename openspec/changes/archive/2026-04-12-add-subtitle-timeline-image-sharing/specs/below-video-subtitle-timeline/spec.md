## MODIFIED Requirements

### Requirement: External subtitle timeline supports manual browsing and current-position relocation
系统 MUST 允许用户在宿主页悬浮字幕时间轴中手动滚动浏览字幕，同时提供回到当前播放位置、管理选中字幕和触发分享的快捷能力。

#### Scenario: Paused playback does not interrupt manual browsing
- **WHEN** 视频处于暂停状态且用户手动滚动外置时间轴
- **THEN** 系统 MUST 不自动将外置时间轴滚回当前字幕位置

#### Scenario: User can relocate to current subtitle
- **WHEN** 用户点击外置时间轴中的“定位当前”操作
- **THEN** 系统 MUST 将外置时间轴滚动到当前播放时间对应的字幕条目附近

#### Scenario: User can access selection and sharing actions
- **WHEN** 用户打开宿主页悬浮字幕时间轴窗口
- **THEN** 系统 MUST 提供与字幕选择和分享相关的可见操作入口
