// Run: node --preserve-symlinks tests/visitor-browser.cjs
// Uses the real offline entry and its existing bundle. Does not build or write artifacts.
const {chromium} = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const entry = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const stops = [
  ['origins', '序章·漫长来路'], ['match', '首尔·五番棋'], ['decision', '落子之前'],
  ['dimensions', '数据的形状'], ['growth', '计算与成长']
];
// Expectations are independent of the production reducer and are never injected into the page.
const roles = [
  {id: 'researcher', name: '研究员', stages: [
    {title: '划定数据边界', evidence: 'A01、A02', wrong: 'positions', error: '同盘', right: 'games'},
    {title: '执行一次参数更新', evidence: '0.42456', wrong: 'search', error: '没有维护搜索树', right: 'weight'},
    {title: '签署研究结论', evidence: '未验证', wrong: 'master', error: '无法支持棋力', right: 'bounded'}
  ]},
  {id: 'engineer', name: '系统工程师', stages: [
    {title: '分配计算职责', route: 'match', evidence: '状态编码 → 搜索调度', wrong: 'fan', error: '风扇负责', right: 'cooperate'},
    {title: '诊断数据瓶颈', route: 'growth', evidence: '4 + 6 = 10 ms', wrong: 'cores', error: '仅降至 14 ms', right: 'supply'},
    {title: '交付运行说明', route: 'decision', evidence: '这次请求使用固定权重', wrong: 'learn', error: '没有训练更新网络参数', right: 'separate'}
  ]},
  {id: 'analyst', name: '对局分析师', stages: [
    {title: '区分第一印象与搜索判断', evidence: '访问 8', wrong: 'prior', error: '不能预先锁定', right: 'revise'},
    {title: '核算一次回传', evidence: '1.8 ÷ 3 = 0.6', wrong: 'replace', error: '丢掉已有两次评估', right: 'average'},
    {title: '撰写有边界的复盘', evidence: '均由展陈编写', wrong: 'replay', error: '不能宣称复现实战', right: 'distinguish'}
  ]}
];

const report = {
  testedAt: new Date().toISOString(), entry,
  renderer: 'Microsoft Edge / SwiftShader software; no physical GPU performance claims',
  interaction: 'locator.click() and native keyboard; no forced clicks, dispatched events or state injection',
  checks: [], observations: [], errors: [], failures: []
};

function check(name, passed) {
  report.checks.push({name, passed: Boolean(passed)});
  assert.ok(passed, name);
}

async function focusIs(page, selector, label) {
  await page.waitForFunction(selector => document.querySelector(selector) === document.activeElement, selector);
  check(label, true);
}

async function atStop(page, id) {
  await page.waitForURL(url => url.hash === `#${id}`);
  await page.locator(`#${id}-view`).waitFor({state: 'visible'});
}

async function go(page, id) {
  await page.locator(`#nav-${id}`).click();
  await atStop(page, id);
}

async function openMap(page) {
  await page.locator('.visitor-map-trigger').click();
  await page.locator('#visitor-map').waitFor({state: 'visible'});
}

async function checkFreshStage(page, prefix, stage, index) {
  check(`${prefix}·第${index + 1}阶段标题`, (await page.locator('.visitor-stage-title').textContent()) === stage.title);
  check(`${prefix}·第${index + 1}阶段序号`, (await page.locator('.visitor-task-head .visitor-kicker').textContent()).includes(`阶段 ${index + 1} / 3`));
  check(`${prefix}·取证前不显示证据`, await page.locator('.visitor-evidence-copy').count() === 0);
  const answers = page.locator('[data-visitor-answer]');
  let allDisabled = await answers.count() === 3;
  for (const answer of await answers.all()) allDisabled = allDisabled && await answer.isDisabled();
  check(`${prefix}·取证前答案不可提交`, allDisabled);
  check(`${prefix}·正确判断前不可前进`, await page.locator('[data-visitor-task="next"]').isDisabled());
}

async function roleFlows(page, prefix) {
  await go(page, 'origins');
  check(`${prefix}·00页先交代课堂角色`, (await page.locator('#visitor-identity').textContent()).includes('系统工程师'));
  check(`${prefix}·学生没有角色选择器`, await page.locator('#visitor-identity [data-visitor-role]').count() === 0);
  check(`${prefix}·角色说明不带免责声明`, await page.locator('#visitor-identity .visitor-boundary').count() === 0);
  check(`${prefix}·角色介绍没有按钮`, await page.locator('#visitor-identity button').count() === 0);
  check(`${prefix}·角色介绍没有模板免责声明`, !(await page.locator('#visitor-identity').textContent()).includes('不代表历史人物经历'));
  check(`${prefix}·身份不能在04页切换`, await page.locator('#visitor-experience [data-visitor-role]').count() === 0);
  await go(page, 'growth');
  check(`${prefix}·六关互动实验仍在`, await page.locator('#lab-stages button').count() === 6);
  check(`${prefix}·任务明确沿用系统工程师身份`, (await page.locator('.visitor-task-head').textContent()).includes('系统工程师'));
  check(`${prefix}·04页直接进入角色任务`, (await page.locator('.visitor-task-head').textContent()).includes('系统工程师'));
  for (const channel of ['red', 'green', 'blue']) await page.locator(`#lab-body [data-channel="${channel}"]`).click();
  check(`${prefix}·原有第一关可完成`, await page.locator('#lab-next').isEnabled());
  const role = roles.find(item => item.id === 'engineer');
  for (const [index, stage] of role.stages.entries()) {
    const stagePrefix = `${prefix}·系统工程师阶段${index + 1}`;
    await checkFreshStage(page, stagePrefix, stage, index);
    await page.locator('[data-visitor-task="inspect"]').click();
    check(`${stagePrefix}·取证后出现对应证据`, (await page.locator('.visitor-evidence-copy').textContent()).includes(stage.evidence));
    if (stage.route !== 'growth') {
      await page.locator(`[data-visitor-reference="${stage.route}"]`).click();
      await atStop(page, stage.route);
      await go(page, 'growth');
      check(`${stagePrefix}·离开展区再返回仍是同一任务`, (await page.locator('.visitor-evidence-copy').textContent()).includes(stage.evidence) && (await page.locator('.visitor-task-head').textContent()).includes('系统工程师'));
    }
    await page.locator(`[data-visitor-answer="${stage.wrong}"]`).click();
    check(`${stagePrefix}·错误选项不会放行且有说明`, (await page.locator('.visitor-feedback').textContent()).includes(stage.error) && await page.locator('[data-visitor-task="next"]').isDisabled());
    await page.locator(`[data-visitor-answer="${stage.right}"]`).click();
    check(`${stagePrefix}·依据证据完成判断`, (await page.locator('.visitor-feedback').textContent()).startsWith('判断成立'));
    await page.locator('[data-visitor-task="next"]').click();
  }
  check(`${prefix}·完成后形成三阶段复盘`, await page.locator('.visitor-review-item').count() === 3);
  check(`${prefix}·角色任务不提供中途切换`, await page.locator('#visitor-experience [data-visitor-role]').count() === 0);
  await page.reload();
  await page.locator('.visitor-map-trigger').waitFor();
  await go(page, 'growth');
  check(`${prefix}·刷新后保留课堂身份和复盘`, (await page.locator('.visitor-identity-status').textContent()).includes('系统工程师') && (await page.locator('.visitor-workspace').textContent()).includes('系统工程师') && await page.locator('.visitor-review-item').count() === 3);

  // Exercise both ways of dismissing the native dialog from a non-global opener.
  await page.locator('[data-visitor-task="map"]').click();
  await page.locator('[data-visitor-action="close"]').click();
  await focusIs(page, '[data-visitor-task="map"]', `${prefix}·关闭按钮恢复复盘打开者焦点`);
  await page.locator('[data-visitor-task="map"]').click();
  await page.keyboard.press('Escape');
  await focusIs(page, '[data-visitor-task="map"]', `${prefix}·Escape恢复复盘打开者焦点`);

  await go(page, 'growth');
  check(`${prefix}·身份在全部展区持续显示`, (await page.locator('.visitor-task-head').textContent()).includes('系统工程师'));
  check(`${prefix}·六关实验仍可访问`, await page.locator('#lab-stages button').count() === 6);
}

async function mapAndGuide(page, prefix) {
  await openMap(page);
  check(`${prefix}·原生模态dialog`, await page.locator('#visitor-map').evaluate(dialog => dialog.open && dialog.matches(':modal')));
  check(`${prefix}·地图包含五个展区`, await page.locator('[data-visitor-stop]').count() === 5);
  await focusIs(page, '[data-visitor-action="close"]', `${prefix}·打开地图聚焦关闭按钮`);
  await page.keyboard.press('Tab');
  await focusIs(page, '[data-visitor-stop="origins"]', `${prefix}·Tab进入地图首个按钮`);
  await page.keyboard.press('Shift+Tab');
  await focusIs(page, '[data-visitor-action="close"]', `${prefix}·反向Tab返回关闭按钮`);
  await page.keyboard.press('Shift+Tab');
  // Native Edge can move focus to browser chrome at the dialog boundary. In that
  // case activeElement is BODY; this must not be mistaken for a focusable background control.
  const boundary = await page.locator('#visitor-map').evaluate(dialog => ({
    tag: document.activeElement.tagName,
    inside: dialog.contains(document.activeElement),
    browserBoundary: document.activeElement === document.body
  }));
  report.observations.push({viewport: prefix, reverseTabBoundary: boundary});
  check(`${prefix}·反向Tab未聚焦背景控件`, boundary.inside || boundary.browserBoundary);
  await page.keyboard.press('Tab');
  if (await page.evaluate(() => document.activeElement === document.body)) await page.keyboard.press('Tab');
  await page.waitForFunction(() => document.querySelector('#visitor-map').contains(document.activeElement));
  check(`${prefix}·边界Tab可返回dialog操作`, true);
  await page.keyboard.press('Escape');
  await focusIs(page, '.visitor-map-trigger', `${prefix}·Escape恢复全站按钮焦点`);

  for (const [id, name] of stops) {
    await openMap(page);
    await page.locator(`[data-visitor-stop="${id}"]`).click();
    await atStop(page, id);
    check(`${prefix}·自由参观${name}`, !(await page.locator('#visitor-map').evaluate(dialog => dialog.open)));
    await focusIs(page, '.visitor-map-trigger', `${prefix}·导航关闭后恢复全站焦点${id}`);
    await openMap(page);
    check(`${prefix}·${name}标记已访问和当前位置`, (await page.locator(`[data-visitor-stop="${id}"] .visitor-visit-label`).textContent()).includes('已访问') && await page.locator(`[data-visitor-stop="${id}"]`).getAttribute('aria-current') === 'location');
    await page.locator('[data-visitor-action="close"]').click();
  }
  check(`${prefix}·五区访问记录`, (await page.locator('.visitor-visit-count').textContent()).trim() === '5 / 5');
  await openMap(page);
  await page.locator('[data-visitor-action="start"]').click();
  await atStop(page, 'origins');
  await focusIs(page, '.visitor-guide-title', `${prefix}·开始讲解后标题获得焦点`);
  check(`${prefix}·首站禁止后退`, await page.locator('.visitor-guide [data-visitor-action="previous"]').isDisabled());

  for (const [index, [id, name]] of stops.entries()) {
    if (index > 0) { await page.locator('.visitor-guide [data-visitor-action="next"]').click(); await atStop(page, id); }
    check(`${prefix}·讲解${index + 1}站标题`, (await page.locator('.visitor-guide-title').textContent()).startsWith(`${name} ·`));
    check(`${prefix}·讲解${index + 1}站序号`, (await page.locator('.visitor-guide-head .visitor-kicker').textContent()).includes(`${index + 1} / 5`));
    check(`${prefix}·讲解${index + 1}站内容与问题`, (await page.locator('.visitor-guide > .visitor-copy').textContent()).length > 30 && (await page.locator('.visitor-prompt').textContent()).length > 15);
    if (index === 1) {
      await page.locator('.visitor-guide [data-visitor-action="previous"]').click();
      await atStop(page, 'origins');
      check(`${prefix}·讲解能后退并保留访问记录`, (await page.locator('.visitor-guide-head .visitor-kicker').textContent()).includes('1 / 5') && (await page.locator('.visitor-visit-count').textContent()).trim() === '5 / 5');
      await page.locator('.visitor-guide [data-visitor-action="next"]').click();
      await atStop(page, 'match');
    }
  }
  check(`${prefix}·末站没有越界前进按钮`, await page.locator('.visitor-guide [data-visitor-action="next"]').count() === 0);
  await page.locator('.visitor-guide-actions [data-visitor-action="end"]').click();
  check(`${prefix}·结束隐藏讲解`, !(await page.locator('.visitor-guide').isVisible()));
  await focusIs(page, '.visitor-map-trigger', `${prefix}·结束讲解恢复全站按钮焦点`);
  await openMap(page);
  check(`${prefix}·明确记录五站完成`, (await page.locator('.visitor-map-status').textContent()).includes('五站讲解已完成'));
  await page.locator('[data-visitor-action="start"]').click();
  await atStop(page, 'origins');
  await page.locator('.visitor-guide-head [data-visitor-action="end"]').click();
  await openMap(page);
  check(`${prefix}·提前结束不冒充全程完成`, !(await page.locator('.visitor-map-status').textContent()).includes('五站讲解已完成') && (await page.locator('.visitor-map-status').textContent()).includes('5 / 5'));
  await page.locator('[data-visitor-action="close"]').click();

  await page.reload();
  await page.locator('.visitor-map-trigger').waitFor();
  check(`${prefix}·刷新保留已访问记录`, (await page.locator('.visitor-visit-count').textContent()).trim() === '5 / 5');
}

async function phoneLayout(page) {
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    for (const [id, name] of stops) {
      await go(page, id);
      check(`手机${width}·${name}无横向溢出`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await openMap(page);
    check(`手机${width}·地图在视口内且无横向溢出`, await page.locator('#visitor-map').evaluate(dialog => {
      const rect = dialog.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth;
    }));
    await page.locator('[data-visitor-action="close"]').click();
    if (width === 390) {
      await go(page, 'origins');
      await go(page, 'growth');
      await page.locator('[data-visitor-task="inspect"]').click();
      await page.locator('[data-visitor-answer="cooperate"]').click();
      check(`手机${width}·任务按钮普通点击可达`, await page.locator('[data-visitor-task="next"]').isEnabled());
      check(`手机${width}·证据和选项无横向溢出`, await page.locator('.visitor-workspace').evaluate(node => node.scrollWidth <= node.clientWidth));
    }
    await openMap(page);
    await page.locator('[data-visitor-action="start"]').click();
    await atStop(page, 'origins');
    check(`手机${width}·讲解面板在视口内`, await page.locator('.visitor-guide').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && node.scrollWidth <= node.clientWidth;
    }));
    await page.locator('.visitor-guide [data-visitor-action="next"]').click();
    await atStop(page, 'match');
    await page.locator('.visitor-guide [data-visitor-action="previous"]').click();
    await atStop(page, 'origins');
    await page.locator('.visitor-guide-head [data-visitor-action="end"]').click();
    await focusIs(page, '.visitor-map-trigger', `手机${width}·讲解前后退及结束可点击`);
  }
}

async function run() {
  let browser;
  try {
    browser = await chromium.launch({headless: true, channel: 'msedge', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    for (const mobile of [false, true]) {
      const prefix = mobile ? '手机390' : '桌面1440';
      const context = await browser.newContext({viewport: {width: mobile ? 390 : 1440, height: mobile ? 844 : 1000}, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile});
      try {
        const page = await context.newPage();
        page.setDefaultTimeout(10000);
        page.on('pageerror', error => report.errors.push({viewport: prefix, type: 'pageerror', message: error.message}));
        page.on('console', message => { if (message.type() === 'error') report.errors.push({viewport: prefix, type: 'console', message: message.text()}); });
        await page.goto(entry);
        await page.locator('.visitor-map-trigger').waitFor();
        check(`${prefix}·角色导入、任务区与地图各挂载一次`, await page.locator('#visitor-identity').count() === 1 && await page.locator('#visitor-experience').count() === 1 && await page.locator('#visitor-map').count() === 1);
        await roleFlows(page, prefix);
        await mapAndGuide(page, prefix);
        if (mobile) await phoneLayout(page);
      } catch (error) {
        report.failures.push({viewport: prefix, message: error.stack || String(error)});
      } finally { await context.close(); }
    }
  } catch (error) { report.failures.push({viewport: 'setup', message: error.stack || String(error)}); }
  finally {
    if (browser) await browser.close().catch(error => report.failures.push({viewport: 'cleanup', message: error.message}));
    report.passed = report.checks.filter(item => item.passed).length;
    report.failed = report.checks.filter(item => !item.passed).length;
    report.ok = report.failed === 0 && report.failures.length === 0 && report.errors.length === 0;
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}

run();
