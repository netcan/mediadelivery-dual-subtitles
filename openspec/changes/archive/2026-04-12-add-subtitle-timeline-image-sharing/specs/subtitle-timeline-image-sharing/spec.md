## ADDED Requirements

### Requirement: User can select subtitle timeline items for sharing
系统 MUST 允许用户在宿主页悬浮字幕时间轴中选择一个或多个字幕条目，以便后续执行分享图片操作。

#### Scenario: Plain click keeps navigation behavior
- **WHEN** 用户普通点击某条时间轴字幕且未按下修饰键
- **THEN** 系统 MUST 保持现有跳转到对应视频时间点的行为

#### Scenario: Ctrl or Cmd click toggles a single subtitle item
- **WHEN** 用户按住 `Ctrl` 或 `Cmd` 点击某条时间轴字幕
- **THEN** 系统 MUST 在不影响其他已选条目的情况下切换该条目的选中状态

#### Scenario: Shift click selects a continuous range
- **WHEN** 用户按住 `Shift` 点击某条时间轴字幕且当前存在选择锚点
- **THEN** 系统 MUST 选中从锚点到当前条目之间的连续字幕范围

### Requirement: User can manage selection state in the floating subtitle timeline panel
系统 MUST 在悬浮字幕时间轴窗口中提供可见的选择管理能力，包括选中反馈、清空选择和可分享状态提示。

#### Scenario: Selected subtitle items are visually highlighted
- **WHEN** 用户选中了一个或多个字幕条目
- **THEN** 系统 MUST 为这些条目提供区别于当前播放高亮的选中视觉状态

#### Scenario: User clears the current selection
- **WHEN** 用户点击清空选择操作
- **THEN** 系统 MUST 清除当前所有已选字幕条目并恢复未选中状态

### Requirement: User can generate a bilingual share image from selected subtitle items
系统 MUST 能根据当前选中的字幕条目生成一张可下载的双语分享图片，并在图片中保留时间戳、英文字幕和中文字幕。

#### Scenario: Generate image from selected items
- **WHEN** 用户已选择至少一条字幕并触发分享图片操作
- **THEN** 系统 MUST 生成包含所选字幕条目的双语图片，并允许用户下载 PNG 文件

#### Scenario: Share action is unavailable without selection
- **WHEN** 用户尚未选择任何字幕条目
- **THEN** 系统 MUST 禁用分享图片操作或提示需先选择字幕

#### Scenario: Long subtitle text wraps in generated image
- **WHEN** 选中的字幕内容较长
- **THEN** 系统 MUST 在生成图片时对文本进行自动换行，并保持时间戳与双语内容可读
