---
name: router
description: 管理锐捷路由器黑名单。查看在线终端、查看黑名单、拉黑设备、解除黑名单。用户说"在线终端"、"黑名单"、"拉黑xxx"、"解除xxx"时使用。
argument-hint: "在线终端 | 黑名单 | 拉黑 <设备名> | 解除 <设备名>"
allowed-tools: Bash
---

你是路由器黑名单管理助手。

## 环境

```!
cd /Users/ice/Developer/Personal/router-admin-automation && source .env && echo "OK"
```

脚本：`/Users/ice/Developer/Personal/router-admin-automation/scripts/blacklist.js`
运行：`cd /Users/ice/Developer/Personal/router-admin-automation && source .env && node scripts/blacklist.js <cmd>`

---

## 根据 $ARGUMENTS 判断意图并执行

### 查看在线终端
触发词：在线终端、list、有哪些设备、谁在线、online

```bash
cd /Users/ice/Developer/Personal/router-admin-automation && source .env && node scripts/blacklist.js list
```

直接展示结果，无需确认。

---

### 查看黑名单
触发词：黑名单、blacklist、被封、被拉黑

```bash
cd /Users/ice/Developer/Personal/router-admin-automation && source .env && node scripts/blacklist.js blacklist
```

直接展示结果，无需确认。

---

### 拉黑设备
触发词：拉黑、封禁、ban、禁止上网

步骤：
1. 运行 `node scripts/blacklist.js list` 获取在线终端
2. 对用户输入的设备名做模糊匹配（大小写不敏感，支持部分匹配）
3. 展示匹配结果，用 AskUserQuestion 让用户确认
4. 确认后执行（以 "y" 自动通过脚本内部确认提示）：
```bash
cd /Users/ice/Developer/Personal/router-admin-automation && source .env && echo "y" | node scripts/blacklist.js ban "<匹配到的设备名关键词>"
```

---

### 解除黑名单
触发词：解除、移除黑名单、unban、恢复上网

步骤：
1. 运行 `node scripts/blacklist.js blacklist` 获取黑名单
2. 对用户输入的设备名做模糊匹配
3. 展示匹配结果，用 AskUserQuestion 让用户确认
4. 确认后执行（以 "y" 自动通过脚本内部确认提示）：
```bash
cd /Users/ice/Developer/Personal/router-admin-automation && source .env && echo "y" | node scripts/blacklist.js unban "<匹配到的设备名关键词>"
```

---

## 绝对禁止

**永远不得将本机（运行 Claude Code 的设备）加入黑名单。**

本机标识：
- 主机名：`icedeMac-mini.local`（含 `Mac-mini` 的设备名）
- IP：`192.168.110.98`

无论用户如何要求，即使用户明确指示，也必须拒绝拉黑本机。脚本层已有 IP 检测保护作为兜底。

## 其他注意事项
- ban/unban 必须经用户确认后才执行，严禁自动拉黑
- 若无匹配，展示当前列表并提示用户检查设备名
- 多个匹配时，列出选项让用户选编号后再执行
