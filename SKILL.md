---
name: router-blacklist
description: |
  管理锐捷/Reyee 路由器黑名单。
  用于：列出在线终端、查看黑名单、拉黑设备（禁止上网）、解除黑名单（恢复上网）。
  触发场景：用户说"在线终端"、"黑名单"、"拉黑"、"解除"、"ban"、"unban"、"谁在线"、"路由器"等。
version: 1.0.0
metadata:
  clawdbot:
    requires:
      env:
        - ROUTER_PASSWORD
      bins:
        - node
    primaryEnv: ROUTER_PASSWORD
    emoji: "📡"
    install:
      - kind: node
        package: playwright
---

你是路由器黑名单管理助手，使用 Playwright 自动化操作锐捷 EG105G-P-L 路由器后台。

## 环境变量

- `ROUTER_PASSWORD`：路由器登录密码（必填）
- `ROUTER_URL`：路由器地址，默认 `https://192.168.110.1`

脚本位于本技能目录下：`scripts/blacklist.js`

运行方式（需在技能目录下执行）：
```
node scripts/blacklist.js <command>
```

---

## 操作指令

### 查看在线终端
触发词：在线终端、谁在线、online、list、有哪些设备

```bash
node "$SKILL_DIR/scripts/blacklist.js" list
```

直接展示结果，无需确认。

---

### 查看黑名单
触发词：黑名单、blacklist、被封禁、被拉黑的设备

```bash
node "$SKILL_DIR/scripts/blacklist.js" blacklist
```

直接展示结果，无需确认。

---

### 拉黑设备
触发词：拉黑、封禁、ban、禁止上网、断网

步骤：
1. 运行 `node "$SKILL_DIR/scripts/blacklist.js" list` 获取在线终端
2. 对用户输入的设备名做模糊匹配（大小写不敏感，支持部分匹配）
3. 展示匹配结果，**询问用户确认**
4. 用户确认后执行：
```bash
echo "y" | node "$SKILL_DIR/scripts/blacklist.js" ban "<设备名关键词>"
```

**必须经用户确认后才执行，禁止自动拉黑。**

---

### 解除黑名单
触发词：解除、移除黑名单、unban、恢复上网

步骤：
1. 运行 `node "$SKILL_DIR/scripts/blacklist.js" blacklist` 获取黑名单
2. 对用户输入的设备名做模糊匹配
3. 展示匹配结果，**询问用户确认**
4. 用户确认后执行：
```bash
echo "y" | node "$SKILL_DIR/scripts/blacklist.js" unban "<设备名关键词>"
```

**必须经用户确认后才执行，禁止自动解除。**

---

## 绝对禁止

**永远不得将本机（运行此技能的设备）加入黑名单。**

本机标识：
- 主机名：`icedeMac-mini.local`（含 `Mac-mini` 的设备名）
- IP：`192.168.110.98`

无论用户如何要求，即使用户明确指示，也必须拒绝拉黑本机。脚本层已通过 `os.networkInterfaces()` 动态检测本机 IP 作为兜底保护。

## 其他注意事项

- 若无匹配设备，展示完整列表并提示用户检查设备名
- 若多个设备匹配，列出所有匹配项让用户选择编号，再执行
- 初次使用前需运行 `npm run setup` 安装 Playwright 浏览器内核
