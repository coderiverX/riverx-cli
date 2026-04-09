# RiverX

用自然语言操作你的 Linux / macOS 系统。

> 当前版本：v0.1.0（开发中）

---

## 安装

**前置要求**
- Node.js >= 20
- pnpm

```bash
# 克隆仓库
git clone git@github.com:coderiverX/riverx-cli.git
cd riverx-cli

# 安装依赖
pnpm install

# 编译
pnpm build
```

**全局安装（可选）**

```bash
npm install -g .
```

安装后可直接使用 `riverx` 命令。

---

## 配置

首次使用前需配置 API key（Qwen 通义千问）：

```bash
mkdir -p ~/.riverx
cat > ~/.riverx/config.json << 'EOF'
{
  "llm": {
    "provider": "qwen",
    "model": "qwen-plus",
    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "api_key": "你的 API Key"
  },
  "security": {
    "workspace_root": "cwd",
    "auto_confirm_safe_commands": true,
    "confirm_medium_risk": false
  },
  "shell": {
    "default": "auto",
    "timeout_ms": 30000
  }
}
EOF
```

也可通过环境变量覆盖：

```bash
export RIVERX_API_KEY="你的 API Key"
export RIVERX_MODEL="qwen-plus"
```

---

## 启动

```bash
# Headless 模式（单次执行）
node dist/main.js "列出当前目录下最大的 10 个文件"

# 全局安装后
riverx "查找所有包含 TODO 的 ts 文件"

# REPL 交互模式（开发中）
riverx
```

---

## 其他命令

```bash
riverx --help      # 帮助信息
riverx --version   # 版本号
riverx --config    # 查看当前配置
```

---

## 开发

```bash
pnpm build         # 编译 TypeScript
pnpm test          # 运行测试
```

---

## 进度

详见 [docs/PROGRESS.md](docs/PROGRESS.md)
