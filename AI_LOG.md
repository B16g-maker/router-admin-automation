# AI Log

> 本文件记录该项目由 Claude Code (claude-sonnet-4-6) 辅助构建的完整过程，包括关键决策、遇到的问题和解决方案。

---

## 2026-04-19

### 目标

通过 Playwright CLI 自动化操作锐捷 Reyee EG105G-P-L 路由器后台，实现黑名单设备管理：列出在线终端、拉黑设备、解除黑名单。

---

### 探索阶段

**路由器界面分析**

路由器运行锐捷 eWeb 系统（基于 Vue + Element UI），访问地址 `https://192.168.110.1`。首次探索遇到两个问题：

1. **HTTPS 自签名证书**：需要 `ignoreHTTPSErrors: true` + `--ignore-certificate-errors` 启动参数，且 `waitUntil` 需改为 `domcontentloaded`（`networkidle` 会超时）。
2. **登录按钮选择器**：页面 HTML 中密码 input 的 `placeholder` 属性为空（注释里才写了提示文字），实际需用 `#password` 和 `button#login`。

**页面结构**

登录后发现关键路径：
- **在线终端**：侧边栏菜单 `#stephome_online`，表格使用 Element UI `el-table`
- **黑白名单**：工作台子菜单，URL 为 `/admin/home_overview/wifi_bwlist`

导航黑白名单时，直接用 URL 跳转比点击菜单更可靠（菜单渲染有时序问题）：
```js
await page.goto(`${ROUTER_URL}/cgi-bin/luci/;stok=${stok}/admin/home_overview/wifi_bwlist`)
```

---

### 数据提取

**在线终端表格列映射**

表格含隐藏列（`is-hidden`），导致 `cells[index]` 索引不稳定。改用列 class 名精确定位：
- `column_2`：设备名称
- `column_3`：连接方式
- `column_5`：IP / MAC（两行文本，按 `\n` 分割）
- `column_7`：操作按钮（访问控制 / 终端关联 / 拉黑）

过滤条件：排除 MAC 为 `00:00:00:00:00:00` 的网关条目。

**黑名单表格列映射**
- `column_2`：设备名称（含修改图标按钮）
- `column_3`：MAC 地址
- `column_4`：操作按钮（修改 / 删除）

---

### 按钮点击问题

headless 模式下，直接调用 Playwright 的 `elementHandle.click()` 报"element is not visible"超时。根本原因：Element UI 按钮组件在某些状态下有 CSS visibility 控制，Playwright 默认等待元素可见。

**解决方案**：改用 `page.evaluate()` / `element.$eval()` 通过 JS 直接调用 `.click()`，绕过可见性检查：

```js
await targetRow.$eval('[class*="column_7"]', cell => {
  cell.querySelectorAll('button')[last].click();
});
```

确认弹窗同理：
```js
await page.waitForSelector('.el-message-box__btns .el-button--primary', { timeout: 5000 });
await page.evaluate(sel => document.querySelector(sel)?.click(), confirmSel);
```

---

### 技能集成

**Claude Code skill**

格式：`.claude/skills/router/SKILL.md`，通过 `/router` 斜杠命令调用。Skill 工具（`Skill tool`）仅限内置技能，自定义技能只能用斜杠命令触发。

**OpenClaw skill**

OpenClaw 是开源个人 AI 助手框架（作者：Peter Steinberg，2025-11），采用 Gateway + Agent + Skills 三层架构，技能格式与 Claude Code 几乎相同（同为 SKILL.md + YAML frontmatter），额外支持 `metadata.clawdbot` 字段声明依赖环境变量、安装指令等。

将项目根目录设计为 OpenClaw 技能包本身，`SKILL.md` 在根，脚本在 `scripts/`。

---

### 自我保护机制

**需求**：永远不允许将运行本工具的设备加入黑名单。

**实现**：

macOS 使用随机 MAC 地址（私有 Wi-Fi 地址），路由器看到的 MAC（`9A:BA:C4:3B:7A:EB`）与硬件 MAC（`1c:f6:4c:5f:0d:5f`）不同，因此不能靠 MAC 保护，改用 IP：

```js
function getLocalIPs() {
  const ips = new Set();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) ips.add(iface.address);
    }
  }
  return ips;
}

function assertNotSelf(target) {
  if (getLocalIPs().has(target.ip)) throw new Error('🚫 拒绝执行：不允许将自己加入黑名单。');
}
```

`assertNotSelf` 在 `executeBan` 入口调用，脚本层保护无法被调用方绕过。两个 SKILL.md 也写入硬性规则作为 AI 约束层。

---

### 最终项目结构

```
router-blacklist/
  SKILL.md                        OpenClaw 技能定义（可发布至 ClawHub）
  scripts/
    blacklist.js                  Playwright 自动化脚本（353 行）
  .claude/
    skills/router/SKILL.md        Claude Code /router 技能
    settings.local.json
  package.json
  .env / .env.example
  .gitignore
  README.md
  AI_LOG.md
```

---

### 关键技术决策汇总

| 决策 | 选择 | 原因 |
|------|------|------|
| 浏览器操作方式 | Playwright headless | 无需 API，直接操作现有 Web UI |
| 导航黑名单页 | 直接 URL 跳转 | 菜单点击有渲染时序问题 |
| 按钮点击方式 | JS `.click()` via evaluate | 绕过 Element UI 可见性限制 |
| 自我保护依据 | 本机 IP（运行时获取） | macOS 随机 MAC 不稳定，IP 更可靠 |
| 技能目录层级 | 项目根 = OpenClaw 技能包 | 脚本和技能定义共享，结构清晰 |
