## ADDED Requirements

### Requirement: User can export selected subtitle items as bilingual TXT
系统 MUST 允许用户基于悬浮字幕时间轴中当前选中的字幕条目导出一份双语 TXT 文件，且文件内容不包含时间信息。

#### Scenario: Export TXT from selected subtitle items
- **WHEN** 用户已选择至少一条字幕并触发“导出 TXT”操作
- **THEN** 系统 MUST 下载一个包含所选字幕内容的 `.txt` 文件，且文件中不包含开始时间、结束时间或其他时间戳字段

#### Scenario: Export action is unavailable without selection
- **WHEN** 用户尚未选择任何字幕条目
- **THEN** 系统 MUST 禁用“导出 TXT”操作或提示需先选择字幕

### Requirement: Exported TXT keeps bilingual reading order
系统 MUST 以稳定且可读的双语顺序组织导出的 TXT 内容，使用户能够直接阅读或继续复制处理。

#### Scenario: One subtitle item keeps English then Chinese order
- **WHEN** 某个字幕条目同时包含英文与中文字幕
- **THEN** 系统 MUST 在导出文件中先写入英文，再换行写入中文，并在条目之间插入空行

#### Scenario: Subtitle item without Chinese remains exportable
- **WHEN** 某个字幕条目只有英文内容或中文内容为空
- **THEN** 系统 MUST 仍然导出该条目的可用文本内容，而不是插入时间信息或无意义占位符

### Requirement: TXT export does not break existing timeline behavior
系统 MUST 确保 TXT 导出与现有时间轴导航、多选、图片分享和暂停自由滚动行为兼容。

#### Scenario: TXT export coexists with image sharing and navigation
- **WHEN** 用户完成多选后交替使用跳转、图片分享和 TXT 导出
- **THEN** 系统 MUST 保持当前选中状态、点击跳转和其他时间轴交互按既有规则工作
