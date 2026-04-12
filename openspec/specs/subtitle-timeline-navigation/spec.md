# subtitle-timeline-navigation Specification

## Purpose
TBD - created by archiving change add-subtitle-timeline-navigation. Update Purpose after archive.
## Requirements
### Requirement: 插件必须展示可导航的双语字幕时间轴
系统 MUST 在插件面板中展示一个按时间顺序排列的字幕时间轴，并以当前主字幕轨为基准显示时间戳、主字幕文本和对应副字幕文本。

#### Scenario: 展示双语字幕时间轴
- **WHEN** 当前视频存在可用的主字幕轨，且插件面板已打开
- **THEN** 系统 MUST 在面板中展示按时间排序的字幕条目列表，并为每条条目显示开始时间与主字幕文本

#### Scenario: 展示匹配的副字幕文本
- **WHEN** 当前同时存在可用的副字幕轨，且其时间轴与主字幕存在重叠或可匹配关系
- **THEN** 系统 MUST 在对应主字幕条目中显示匹配到的副字幕文本，而不是只显示单语内容

### Requirement: 插件必须支持点击字幕时间轴跳转
系统 MUST 允许用户点击字幕时间轴中的条目，并将视频跳转到该条字幕对应的开始时间点。

#### Scenario: 点击条目跳转视频
- **WHEN** 用户点击某条字幕时间轴条目
- **THEN** 系统 MUST 将视频播放位置跳转到该条字幕的开始时间

#### Scenario: 暂停状态下点击跳转
- **WHEN** 视频当前处于暂停状态，用户点击某条字幕时间轴条目
- **THEN** 系统 MUST 更新视频播放位置，但 MUST NOT 因该操作自动开始播放

### Requirement: 插件必须高亮当前播放对应的字幕时间轴条目
系统 MUST 根据当前视频播放时间高亮对应的字幕时间轴条目，并在播放位置变化时持续更新。

#### Scenario: 播放中高亮当前项
- **WHEN** 视频正在播放，当前播放时间进入某条字幕条目的时间范围
- **THEN** 系统 MUST 将该字幕条目标记为当前激活项

#### Scenario: 中文配音启用时点击时间轴
- **WHEN** 用户启用了中文配音，并点击字幕时间轴条目跳转到新时间点
- **THEN** 系统 MUST 继续通过既有的视频跳转同步链路保持字幕与中文配音状态一致

