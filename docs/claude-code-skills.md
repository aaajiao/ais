# Claude Code Skills 配置指南

本文档记录了 Claude Code skills 的配置经验和最佳实践。

## 已安装的 Skills

位置：`.agents/skills/`（通过 symlink 链接到 `.claude/skills/`）

| Skill | 来源 | 用途 |
|-------|------|------|
| ai-sdk | vercel/ai | Vercel AI SDK 文档与指导 |
| frontend-design | anthropics/skills | 前端界面设计 |
| supabase-postgres-best-practices | supabase/agent-skills | PostgreSQL 最佳实践 |

全局技能（`~/.claude/skills/`）：

| Skill | 用途 |
|-------|------|
| context7 | 获取最新库文档 |

## 安装与更新 Skill

使用 [skills.sh](https://skills.sh/) 查找技能，通过 `npx skills add` 安装：

```bash
# 安装到项目（默认）
npx skills add https://github.com/<owner>/<repo> --skill <name>

# 自动确认（跳过交互）
npx skills add https://github.com/<owner>/<repo> --skill <name> -y

# 安装到全局
npx skills add https://github.com/<owner>/<repo> --skill <name> -y -g
```

安装后会自动创建 symlink 到 `.claude/skills/`，Claude Code 可直接使用。

## 权限配置

### 配置文件

- `.claude/settings.local.json` - 本地权限配置（不提交到 git）
- `.claude/settings.json` - 共享权限配置

### 权限规则语法

```json
{
  "permissions": {
    "allow": [
      "Bash(curl:*)",           // 允许所有 curl 命令
      "Bash(git add:*)",        // 允许 git add 命令
      "Skill(context7)",        // 允许 context7 skill
      "Skill(context7:*)"       // 允许带参数的 context7
    ]
  }
}
```

### 重要发现：权限匹配规则

**权限规则使用简单的前缀匹配，不支持复杂的 shell 语法。**

#### 不生效的写法

```json
// 这些规则不会正确匹配：
"Bash(export $(grep KEY .env) && curl *)"   // $() 不支持
"Bash(source .env && curl *)"                // 变量展开不支持
```

#### 正确的写法

```json
// 使用简单的命令前缀：
"Bash(curl:*)"      // 匹配所有 curl 开头的命令
"Bash(curl -s *)"   // 匹配 curl -s 开头的命令
```

## 调试权限问题

如果命令需要确认才能执行：

1. 检查 `settings.local.json` 中是否有匹配的规则
2. 简化命令，移除 shell 变量和复杂语法
3. 使用更宽泛的通配符规则如 `Bash(curl:*)`
