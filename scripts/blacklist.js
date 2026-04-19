#!/usr/bin/env node
/**
 * 锐捷 EG105G-P-L 路由器黑名单管理工具
 *
 * 用法:
 *   node blacklist.js ban   <设备名称关键词>   # 将在线终端加入黑名单
 *   node blacklist.js unban <设备名称关键词>   # 将黑名单终端移除
 *   node blacklist.js list                    # 列出在线终端
 *   node blacklist.js blacklist               # 列出黑名单
 *
 * 环境变量:
 *   ROUTER_URL       路由器地址，默认 https://192.168.110.1
 *   ROUTER_PASSWORD  路由器密码（必填）
 */

const { chromium } = require('playwright');
const readline = require('readline');
const os = require('os');

const ROUTER_URL = process.env.ROUTER_URL || 'https://192.168.110.1';
const PASSWORD = process.env.ROUTER_PASSWORD;

if (!PASSWORD) {
  console.error('错误：请设置 ROUTER_PASSWORD 环境变量');
  process.exit(1);
}

// ── 自我保护：永远不允许将本机加入黑名单 ─────────────────────────────────────

/** 获取本机当前所有 IPv4 地址 */
function getLocalIPs() {
  const ips = new Set();
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) ips.add(iface.address);
    }
  }
  return ips;
}

/** 如果目标设备是本机，抛出错误阻止拉黑 */
function assertNotSelf(target) {
  const localIPs = getLocalIPs();
  if (localIPs.has(target.ip)) {
    throw new Error(`🚫 拒绝执行：「${target.name}」(${target.ip}) 是本机，不允许将自己加入黑名单。`);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans.trim()); }));
}

/** 模糊匹配：关键词命中设备名称（大小写不敏感，支持空格分词） */
function fuzzyMatch(name, keyword) {
  const n = name.toLowerCase();
  const k = keyword.toLowerCase();
  return n.includes(k) || k.split(/\s+/).every(w => n.includes(w));
}

async function createBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors'],
  });
}

async function login(page) {
  await page.goto(ROUTER_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.fill('#password', PASSWORD);
  await page.click('button#login');
  await page.waitForTimeout(3000);
}

// ── 获取在线终端列表 ──────────────────────────────────────────────────────────

async function getOnlineTerminals(page) {
  await page.click('#stephome_online');
  await page.waitForSelector('.el-table__row', { timeout: 10000 });
  await page.waitForTimeout(1000);

  const rows = await page.$$eval('.el-table__row', rows =>
    rows.map(row => {
      // column_2 = name, column_3 = connection, column_5 = IP/MAC, column_7 = actions
      const nameCell = row.querySelector('[class*="column_2"]');
      const connCell = row.querySelector('[class*="column_3"]');
      const ipMacCell = row.querySelector('[class*="column_5"]');
      const actionCell = row.querySelector('[class*="column_7"]');

      const name = nameCell?.innerText?.split('\n')[0]?.trim() || '';
      const conn = connCell?.innerText?.trim().replace(/\s+/g, ' ') || '';
      const ipMacLines = (ipMacCell?.innerText || '').split('\n').map(s => s.trim()).filter(Boolean);
      const ip = ipMacLines[0] || '';
      const mac = ipMacLines[1] || '';
      // Has block button?
      const hasBlockBtn = !!actionCell?.querySelector('button:last-child') &&
        actionCell?.innerText?.includes('Block') || actionCell?.innerText?.includes('拉黑');

      return { name, conn, ip, mac, hasBlockBtn };
    }).filter(r => r.name && r.mac && r.mac !== '00:00:00:00:00:00')
  );
  return rows;
}

// ── 获取黑名单列表 ────────────────────────────────────────────────────────────

async function getBlacklist(page) {
  // Extract stok from current URL for direct navigation
  const stok = page.url().match(/;stok=([^/]+)/)?.[1];
  if (!stok) throw new Error('无法获取 stok token');
  await page.goto(`${ROUTER_URL}/cgi-bin/luci/;stok=${stok}/admin/home_overview/wifi_bwlist`,
    { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForSelector('.el-table', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Check if table has rows (empty list shows no rows)
  const rowCount = await page.$$eval('.el-table__row', rows => rows.length);
  if (rowCount === 0) return [];

  const rows = await page.$$eval('.el-table__row', rows =>
    rows.map(row => {
      const cells = row.querySelectorAll('td');
      // Skip checkbox cell (column_1), name is column_2, mac is column_3
      const nameCell = row.querySelector('[class*="column_2"]');
      const macCell = row.querySelector('[class*="column_3"]');
      const name = nameCell?.innerText?.trim() || '';
      const mac = macCell?.innerText?.trim() || '';
      return { name, mac };
    }).filter(r => r.mac)
  );
  return rows;
}

// ── 命令：list ────────────────────────────────────────────────────────────────

async function cmdList() {
  const browser = await createBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await login(page);
    const terminals = await getOnlineTerminals(page);
    console.log(`\n在线终端（共 ${terminals.length} 台）:\n`);
    terminals.forEach((t, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${t.name.padEnd(25)} ${t.ip.padEnd(16)} ${t.mac}  [${t.conn}]`);
    });
    console.log('');
  } finally {
    await browser.close();
  }
}

// ── 命令：blacklist ───────────────────────────────────────────────────────────

async function cmdBlacklist() {
  const browser = await createBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await login(page);
    const list = await getBlacklist(page);
    if (list.length === 0) {
      console.log('\n黑名单为空。\n');
    } else {
      console.log(`\n黑名单（共 ${list.length} 台）:\n`);
      list.forEach((t, i) => {
        console.log(`  ${String(i + 1).padStart(2)}. ${t.name.padEnd(25)} ${t.mac}`);
      });
      console.log('');
    }
  } finally {
    await browser.close();
  }
}

// ── 命令：ban ─────────────────────────────────────────────────────────────────

async function cmdBan(keyword) {
  const browser = await createBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await login(page);
    const terminals = await getOnlineTerminals(page);

    const matches = terminals.filter(t => fuzzyMatch(t.name, keyword));

    if (matches.length === 0) {
      console.log(`\n未找到匹配「${keyword}」的在线终端。\n`);
      console.log('当前在线终端：');
      terminals.forEach(t => console.log(`  - ${t.name}  ${t.ip}  ${t.mac}`));
      return;
    }

    if (matches.length > 1) {
      console.log(`\n找到 ${matches.length} 个匹配「${keyword}」的终端：\n`);
      matches.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}  ${t.ip}  ${t.mac}`));
      const ans = await ask('\n请输入编号选择（或按 Enter 取消）: ');
      const idx = parseInt(ans) - 1;
      if (isNaN(idx) || idx < 0 || idx >= matches.length) {
        console.log('已取消。');
        return;
      }
      const target = matches[idx];
      await executeBan(page, target);
    } else {
      const target = matches[0];
      console.log(`\n找到终端：${target.name}  ${target.ip}  ${target.mac}`);
      const ans = await ask('确认将此设备加入黑名单？(y/N): ');
      if (ans.toLowerCase() !== 'y') {
        console.log('已取消。');
        return;
      }
      await executeBan(page, target);
    }
  } finally {
    await browser.close();
  }
}

async function executeBan(page, target) {
  assertNotSelf(target);
  // Find the row by MAC and click the Block button in action column
  const rows = await page.$$('.el-table__row');
  let targetRow = null;
  for (const row of rows) {
    const text = await row.innerText();
    if (text.includes(target.mac)) {
      targetRow = row;
      break;
    }
  }
  if (!targetRow) {
    console.error(`\n错误：无法在页面中找到 MAC ${target.mac} 对应的行。`);
    return;
  }

  // Click Block (last button in column_7 action cell) via JS to avoid visibility issues
  const clicked = await targetRow.$eval('[class*="column_7"]', cell => {
    const buttons = cell.querySelectorAll('button');
    const last = buttons[buttons.length - 1];
    if (!last) return false;
    last.click();
    return true;
  });
  if (!clicked) { console.error('\n错误：未找到拉黑按钮。'); return; }
  await page.waitForTimeout(1500);

  // Wait for confirm dialog and click 确定
  const confirmSel = '.el-message-box__btns .el-button--primary';
  await page.waitForSelector(confirmSel, { timeout: 5000 });
  await page.evaluate(sel => { document.querySelector(sel)?.click(); }, confirmSel);
  await page.waitForTimeout(2000);
  console.log(`\n✓ 已将「${target.name}」(${target.mac}) 加入黑名单。\n`);
}

// ── 命令：unban ───────────────────────────────────────────────────────────────

async function cmdUnban(keyword) {
  const browser = await createBrowser();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await login(page);
    const list = await getBlacklist(page);

    if (list.length === 0) {
      console.log('\n黑名单为空。\n');
      return;
    }

    const matches = list.filter(t => fuzzyMatch(t.name, keyword));

    if (matches.length === 0) {
      console.log(`\n未找到匹配「${keyword}」的黑名单设备。\n`);
      console.log('当前黑名单：');
      list.forEach(t => console.log(`  - ${t.name}  ${t.mac}`));
      return;
    }

    let target;
    if (matches.length > 1) {
      console.log(`\n找到 ${matches.length} 个匹配「${keyword}」的设备：\n`);
      matches.forEach((t, i) => console.log(`  ${i + 1}. ${t.name}  ${t.mac}`));
      const ans = await ask('\n请输入编号选择（或按 Enter 取消）: ');
      const idx = parseInt(ans) - 1;
      if (isNaN(idx) || idx < 0 || idx >= matches.length) {
        console.log('已取消。');
        return;
      }
      target = matches[idx];
    } else {
      target = matches[0];
      console.log(`\n找到黑名单设备：${target.name}  ${target.mac}`);
      const ans = await ask('确认将此设备从黑名单移除？(y/N): ');
      if (ans.toLowerCase() !== 'y') {
        console.log('已取消。');
        return;
      }
    }

    await executeUnban(page, target);
  } finally {
    await browser.close();
  }
}

async function executeUnban(page, target) {
  const rows = await page.$$('.el-table__row');
  let targetRow = null;
  for (const row of rows) {
    const text = await row.innerText();
    if (text.includes(target.mac)) {
      targetRow = row;
      break;
    }
  }
  if (!targetRow) {
    console.error(`\n错误：无法在黑名单页面中找到 MAC ${target.mac}。`);
    return;
  }

  // Click Delete (last button in column_4 action cell) via JS to avoid visibility issues
  const clicked = await targetRow.$eval('[class*="column_4"]', cell => {
    const buttons = cell.querySelectorAll('button');
    const last = buttons[buttons.length - 1];
    if (!last) return false;
    last.click();
    return true;
  });
  if (!clicked) { console.error('\n错误：未找到删除按钮。'); return; }
  await page.waitForTimeout(1500);

  // Wait for confirm dialog and click 确定
  const confirmSel = '.el-message-box__btns .el-button--primary';
  await page.waitForSelector(confirmSel, { timeout: 5000 });
  await page.evaluate(sel => { document.querySelector(sel)?.click(); }, confirmSel);
  await page.waitForTimeout(2000);

  console.log(`\n✓ 已将「${target.name}」(${target.mac}) 从黑名单移除，设备可重新上网。\n`);
}

// ── 入口 ──────────────────────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;
const keyword = args.join(' ');

const USAGE = `
用法:
  node blacklist.js list                     列出在线终端
  node blacklist.js blacklist                列出黑名单
  node blacklist.js ban   <设备名称关键词>    将在线终端加入黑名单
  node blacklist.js unban <设备名称关键词>    将黑名单设备移除
`;

(async () => {
  switch (cmd) {
    case 'list':      await cmdList(); break;
    case 'blacklist': await cmdBlacklist(); break;
    case 'ban':
      if (!keyword) { console.error('请提供设备名称关键词'); process.exit(1); }
      await cmdBan(keyword);
      break;
    case 'unban':
      if (!keyword) { console.error('请提供设备名称关键词'); process.exit(1); }
      await cmdUnban(keyword);
      break;
    default:
      console.log(USAGE);
  }
})().catch(err => {
  console.error('出错：', err.message);
  process.exit(1);
});
