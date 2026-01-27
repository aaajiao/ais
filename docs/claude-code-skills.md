# Claude Code Skills 配置指南

本文档记录了 Claude Code skills 的配置经验和最佳实践。

## 已安装的 Skills

位置：`.claude/skills/`

| Skill | 用途 |
|-------|------|
| react-best-practices | React/Next.js 性能优化 |
| postgres-best-practices | PostgreSQL 最佳实践 |
| context7 | 获取最新库文档 |
| ai-sdk | Vercel AI SDK 文档 |
| frontend-design | 前端设计技能 |
| skill-creator | 创建新 skill 的指南 |

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

### Skill 脚本的最佳实践

1. **避免复杂的 shell 变量展开**
   - 不要在命令中使用 `${}`, `$()`, `source`, `export`
   - 直接读取配置值并替换到命令中

2. **使用简单的命令结构**
   - 让命令能被 `Bash(command:*)` 规则匹配
   - 复杂逻辑放在脚本文件中，但调用时保持命令简单

3. **示例：Context7 的正确用法**
   ```bash
   # 正确 - 直接使用 API key 值
   curl -s -H "Authorization: Bearer ctx7sk-xxx" "https://..."

   # 错误 - 使用变量展开
   export KEY=xxx && curl -s -H "Authorization: Bearer $KEY" "https://..."
   ```

## 添加新 Skill

1. 使用 skill-creator 初始化：
   ```bash
   python3 .claude/skills/skill-creator/scripts/init_skill.py <name> --path .claude/skills
   ```

2. 编辑 `SKILL.md`，确保命令简单直接

3. 在 `settings.local.json` 添加权限：
   ```json
   "Skill(<name>)",
   "Skill(<name>:*)"
   ```

4. 验证 skill：
   ```bash
   python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/<name>
   ```

## 调试权限问题

如果命令需要确认才能执行：

1. 检查 `settings.local.json` 中是否有匹配的规则
2. 简化命令，移除 shell 变量和复杂语法
3. 使用更宽泛的通配符规则如 `Bash(curl:*)`
