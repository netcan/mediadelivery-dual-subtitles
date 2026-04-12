# fullscreen-playback-shortcuts Specification

## Purpose
TBD - created by archiving change add-fullscreen-keyboard-shortcuts. Update Purpose after archive.
## Requirements
### Requirement: 插件必须在全屏播放模式下支持键盘播放控制
系统 MUST 在当前受管视频处于全屏播放上下文时支持键盘播放控制：按空格键切换播放/暂停，按左方向键后退 5 秒，按右方向键前进 5 秒。

#### Scenario: 空格键切换播放状态
- **WHEN** 当前受管视频处于全屏播放上下文，且焦点不在可编辑区域中，用户按下空格键
- **THEN** 系统 MUST 在播放与暂停之间切换当前视频状态

#### Scenario: 左方向键后退 5 秒
- **WHEN** 当前受管视频处于全屏播放上下文，且焦点不在可编辑区域中，用户按下左方向键
- **THEN** 系统 MUST 将当前视频播放位置回退 5 秒，并且不得小于 0 秒

#### Scenario: 右方向键前进 5 秒
- **WHEN** 当前受管视频处于全屏播放上下文，且焦点不在可编辑区域中，用户按下右方向键
- **THEN** 系统 MUST 将当前视频播放位置前进 5 秒，并且不得超过视频可播放结束位置

### Requirement: 插件必须限制快捷键生效边界
系统 MUST 仅在当前全屏元素包含受管视频时拦截上述快捷键；当焦点位于输入框、文本域、选择框或可编辑区域时，系统 MUST 跳过快捷键处理。

#### Scenario: 非全屏时不拦截快捷键
- **WHEN** 当前页面不处于受管视频的全屏播放上下文，用户按下空格键或左右方向键
- **THEN** 系统 MUST 不将该按键作为插件播放快捷键处理

#### Scenario: 输入区域中不拦截快捷键
- **WHEN** 用户焦点位于 `input`、`textarea`、`select` 或 `contenteditable` 区域中，并按下空格键或左右方向键
- **THEN** 系统 MUST 不拦截该按键，也不得触发视频播放控制

#### Scenario: 中文配音启用时继续保持同步
- **WHEN** 用户已启用中文配音，且在全屏播放上下文中通过空格键或左右方向键控制播放
- **THEN** 系统 MUST 继续通过现有视频同步链路保持中文字幕和中文配音状态一致

