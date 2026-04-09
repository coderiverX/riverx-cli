# Agent 说明

- 代码参考：`/Users/bashful/work/code/ClaudeCode`
- 项目定位：**系统操作助手**——通过自然语言驱动 shell 命令完成系统管理、文件操作、环境配置等日常任务。
- 目标平台：Linux、macOS（优先），根据 OS 适配对应 shell（bash/zsh 等）。
- SSH 远程连接仅作为可选工具，不是产品主要方向。
- UX 构想：在终端以 `@riverx "..."` 命令格式接受自然语言输入。
- 执行模型：LLM 应产出结构化的计划/工具调用，而非自由格式的 shell 脚本。
- MVP 工具：`read_file`、`list_files`、`grep`、`write_file`、`patch_file`、`exec_cmd`、`confirm`、`session`。
- LLM 支持：优先适配 Qwen（通义千问），后续扩展其他模型。
- 安全默认值：操作限定在工作区范围内，先 `plan` 再 `run`，高风险操作需确认。
