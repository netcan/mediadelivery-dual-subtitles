# draggable-subtitle-overlay Specification

## Purpose
TBD - created by archiving change drag-bilingual-subtitles. Update Purpose after archive.
## Requirements
### Requirement: 插件必须支持整体拖动双语字幕覆盖层
系统 MUST 允许用户通过鼠标拖动双语字幕覆盖层，并让中英字幕作为同一个整体容器一起移动。

#### Scenario: 拖动整体字幕容器
- **WHEN** 用户在可见的双语字幕覆盖层上按下鼠标并拖动
- **THEN** 系统 MUST 移动整个字幕容器的位置，且主字幕与副字幕保持相对位置不变

#### Scenario: 拖动后继续刷新字幕内容
- **WHEN** 用户已将字幕容器拖动到新位置，视频继续播放并刷新字幕
- **THEN** 系统 MUST 在新位置继续渲染后续字幕内容，而不是恢复到默认位置或停止刷新

### Requirement: 插件必须限制拖动交互边界
系统 MUST 仅在字幕容器命中时启动拖动，并避免拖动行为影响插件面板控件或将字幕完全移出可视区域。

#### Scenario: 面板交互不触发拖动
- **WHEN** 用户点击插件面板按钮、选择框或其他非字幕控件
- **THEN** 系统 MUST 不将该操作识别为字幕拖动

#### Scenario: 字幕保持可见
- **WHEN** 用户持续拖动字幕容器接近播放器边缘
- **THEN** 系统 MUST 限制最终位置，使字幕容器至少保留可见区域而不是完全移出画面

#### Scenario: 全屏模式下仍可拖动
- **WHEN** 当前视频处于全屏播放状态且字幕覆盖层可见，用户拖动字幕容器
- **THEN** 系统 MUST 继续允许整体拖动字幕，并保持全屏下的位置更新生效

