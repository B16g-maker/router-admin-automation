# router-blacklist

锐捷 Reyee EG105G-P-L 路由器黑名单自动化管理工具。基于 Playwright 操作路由器 Web 后台，支持 CLI 直接调用、Claude Code `/router` 技能、OpenClaw 技能三种使用方式。

## 功能

- 列出当前所有在线终端（名称、IP、MAC、连接方式）
- 列出黑名单设备
- 将在线终端加入黑名单（禁止上网）
- 将黑名单设备移除（恢复上网）
- 自我保护：永远拒绝将运行本工具的设备加入黑名单

## 环境要求

- Node.js 18+
- Playwright Chromium（通过 `npm run setup` 安装）

## 安装

```bash
npm install
npm run setup     # 安装 Playwright 浏览器内核
```

复制配置文件并填入路由器密码：

```bash
cp .env.example .env
# 编辑 .env，填入 ROUTER_PASSWORD
```

## 使用

### CLI

```bash
# 环境变量方式
export ROUTER_PASSWORD=your_password

npm run list        # 列出在线终端
npm run blacklist   # 列出黑名单
npm run ban         # 拉黑（会提示输入设备名）
npm run unban       # 解除（会提示输入设备名）

# 或直接传参
node scripts/blacklist.js ban "设备名关键词"
node scripts/blacklist.js unban "设备名关键词"
```

支持模糊匹配，大小写不敏感：

```
node scripts/blacklist.js ban "macbook"    # 匹配 MacBook-laptop
node scripts/blacklist.js ban "gree"       # 多个匹配时会列出选项
```

### Claude Code

在本项目目录下打开 Claude Code，直接输入斜杠命令：

```
/router 在线终端
/router 黑名单
/router 拉黑 MacBook
/router 解除 niuniu
```

### OpenClaw

将项目目录作为技能包安装：

```bash
cp -r . ~/.openclaw/skills/router-blacklist/
```

设置 `ROUTER_PASSWORD` 环境变量后，即可通过 WhatsApp、微信、飞书等渠道发送指令操作路由器。

## 项目结构

```
router-blacklist/
  SKILL.md                        OpenClaw 技能定义
  scripts/
    blacklist.js                  Playwright 自动化核心脚本
  .claude/
    skills/router/SKILL.md        Claude Code /router 技能
  package.json
  .env                            路由器密码（gitignored）
  .env.example                    配置模板
```

## 自我保护机制

脚本通过 `os.networkInterfaces()` 在运行时动态获取本机所有 IP，`executeBan` 执行前强制检查目标设备 IP 是否与本机匹配。若匹配则抛出异常并终止，无论调用方如何要求均无法绕过。

两个 SKILL.md 中同样写有硬性禁止规则作为 AI 层约束。

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ROUTER_PASSWORD` | 路由器登录密码 | 必填 |
| `ROUTER_URL` | 路由器管理地址 | `https://192.168.110.1` |
