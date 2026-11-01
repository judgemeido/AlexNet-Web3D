// Run: node --preserve-symlinks tests/visitor-browser.cjs
// Uses the real offline entry and its existing bundle. Does not build or write artifacts.
const {chromium} = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const entry = pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const stops = [
  ['origins', '崛起前夜'], ['match', '世纪对局'], ['decision', '决策之核'],
  ['dimensions', '维度解剖'], ['growth', '成长系统']
];
// Expectations are independent of the production reducer and are never injected into the page.
const roles = [
  {id: 'researcher', name: '研究员', stages: [
    {title: '划定数据边界', evidence: 'A01、A02', wrong: 'positions', error: '同盘', right: 'games'},
    {title: '执行一次参数更新', evidence: '0.42456', wrong: 'search', error: '没有维护搜索树', right: 'weight'},
    {title: '签署研究结论', evidence: '未验证', wrong: 'master', error: '无法支持棋力', right: 'bounded'}
  ]},
  {id: 'engineer', name: '系统工程师', stages: [
    {title: '分配计算职责', evidence: '状态编码 → 搜索调度', wrong: 'fan', error: '风扇负责', right: 'cooperate'},
    {title: '诊断数据瓶颈', evidence: '4 + 6 = 10 ms', wrong: 'cores', error: '仅降至 14 ms', right: 'supply'},
    {title: '交付运行说明', evidence: '网络权重保持固定', wrong: 'learn', error: '不同对象', right: 'separate'}
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
  await go(page, 'growth');
  check(`${prefix}·三种专业角色`, await page.locator('[data-visitor-role]').count() === 3);
  check(`${prefix}·情境推演声明`, (await page.locator('.visitor-heading .visitor-boundary').textContent()).includes('不是历史人物经历'));
  check(`${prefix}·原有六关存在`, await page.locator('#lab-stages button').count() === 6);
  for (const channel of ['red', 'green', 'blue']) await page.locator(`#lab-body [data-channel="${channel}"]`).click();
  check(`${prefix}·原有第一关可完成`, await page.locator('#lab-next').isEnabled());

  for (const [roleIndex, role] of roles.entries()) {
    const rolePrefix = `${prefix}·${role.name}`;
    await page.locator(`[data-visitor-role="${role.id}"]`).click();
    for (const [index, stage] of role.stages.entries()) {
      const stagePrefix = `${rolePrefix}·${index + 1}`;
      await checkFreshStage(page, stagePrefix, stage, index);
      await page.locator('[data-visitor-task="inspect"]').click();
      check(`${stagePrefix}·操作后出现具体证据`, (await page.locator('.visitor-evidence-copy').textContent()).includes(stage.evidence));
      check(`${stagePrefix}·取证操作标记完成`, await page.locator('[data-visitor-task="inspect"]').isDisabled());
      await focusIs(page, '[data-visitor-answer]', `${stagePrefix}·取证后焦点进入答案`);
      await page.locator(`[data-visitor-answer="${stage.wrong}"]`).click();
      const feedback = await page.locator('.visitor-feedback').textContent();
      check(`${stagePrefix}·错误有具体反馈`, feedback.includes('需要修正') && feedback.includes(stage.error));
      check(`${stagePrefix}·错误不解锁前进`, await page.locator('[data-visitor-task="next"]').isDisabled());
      check(`${stagePrefix}·错误不清除证据`, (await page.locator('.visitor-evidence-copy').textContent()).includes(stage.evidence));
      await focusIs(page, `[data-visitor-answer="${stage.wrong}"]`, `${stagePrefix}·错误后保留可操作焦点`);
      if (index === 0) {
        const other = roles[(roleIndex + 1) % roles.length];
        await page.locator(`[data-visitor-role="${other.id}"]`).click();
        await page.locator(`[data-visitor-role="${role.id}"]`).click();
        check(`${rolePrefix}·切换角色保留任务和错误`, (await page.locator('.visitor-feedback').textContent()) === feedback && (await page.locator('.visitor-evidence-copy').textContent()).includes(stage.evidence));
      }
      await page.locator(`[data-visitor-answer="${stage.right}"]`).click();
      check(`${stagePrefix}·正确判断得到确认`, (await page.locator('.visitor-feedback').textContent()).startsWith('判断成立'));
      check(`${stagePrefix}·正确后锁定本阶段答案`, await page.locator(`[data-visitor-answer="${stage.wrong}"]`).isDisabled());
      check(`${stagePrefix}·正确后允许前进`, await page.locator('[data-visitor-task="next"]').isEnabled());
      await focusIs(page, '[data-visitor-task="next"]', `${stagePrefix}·正确后焦点进入前进按钮`);
      await page.locator('[data-visitor-task="next"]').click();
      await focusIs(page, index === 2 ? '.visitor-review-title' : '.visitor-stage-title', `${stagePrefix}·前进后焦点进入新内容`);
    }
    check(`${rolePrefix}·三阶段复盘`, await page.locator('.visitor-review-item').count() === 3);
    const summary = await page.locator('.visitor-review-count').textContent();
    check(`${rolePrefix}·复盘记录错误和修正`, summary.includes('提交 6 次') && summary.includes('修正 3 次'));
    const reviews = page.locator('.visitor-review-item');
    for (const [index, stage] of role.stages.entries()) {
      const item = reviews.nth(index);
      check(`${rolePrefix}·复盘${index + 1}包含证据和结论`, (await item.textContent()).includes(stage.evidence) && (await item.locator('.visitor-conclusion').textContent()).length > 15 && (await item.locator('.visitor-attempts').textContent()).includes('2 次'));
    }
    check(`${rolePrefix}·复盘保留教学边界`, (await page.locator('.visitor-workspace .visitor-boundary').textContent()).includes('不能代表真实比赛'));
    check(`${rolePrefix}·卡片记录已完成`, (await page.locator(`[data-visitor-role="${role.id}"] .visitor-role-progress`).textContent()) === '已完成复盘');
  }

  // Exercise both ways of dismissing the native dialog from a non-global opener.
  await page.locator('[data-visitor-task="map"]').click();
  await page.locator('[data-visitor-action="close"]').click();
  await focusIs(page, '[data-visitor-task="map"]', `${prefix}·关闭按钮恢复复盘打开者焦点`);
  await page.locator('[data-visitor-task="map"]').click();
  await page.keyboard.press('Escape');
  await focusIs(page, '[data-visitor-task="map"]', `${prefix}·Escape恢复复盘打开者焦点`);

  for (const [index, role] of roles.entries()) {
    await page.locator(`[data-visitor-role="${role.id}"]`).click();
    await page.locator('[data-visitor-task="restart"]').click();
    await checkFreshStage(page, `${prefix}·${role.name}复盘后重置`, role.stages[0], 0);
    await focusIs(page, '.visitor-stage-title', `${prefix}·${role.name}重置后焦点`);
    if (index < roles.length - 1) {
      const untouched = roles[index + 1];
      check(`${prefix}·重置${role.name}保留${untouched.name}完成状态`, (await page.locator(`[data-visitor-role="${untouched.id}"] .visitor-role-progress`).textContent()) === '已完成复盘');
    }
  }
  // The in-progress reset must also discard evidence and correction history.
  await page.locator('[data-visitor-role="researcher"]').click();
  await page.locator('[data-visitor-task="inspect"]').click();
  await page.locator('[data-visitor-answer="positions"]').click();
  await page.locator('[data-visitor-task="restart"]').click();
  await checkFreshStage(page, `${prefix}·进行中重置`, roles[0].stages[0], 0);
  check(`${prefix}·进行中重置清除错误反馈`, !(await page.locator('.visitor-feedback').textContent()).includes('需要修正'));
  check(`${prefix}·全部角色操作保留原实验进度`, await page.locator('#lab-next').isEnabled());
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
    await page.locator('[data-visitor-stop="growth"]').click();
    await atStop(page, 'growth');
    await page.locator('[data-visitor-role="engineer"]').click();
    await page.locator('[data-visitor-task="restart"]').click();
    await page.locator('[data-visitor-task="inspect"]').click();
    await page.locator('[data-visitor-answer="cooperate"]').click();
    check(`手机${width}·任务按钮普通点击可达`, await page.locator('[data-visitor-task="next"]').isEnabled());
    check(`手机${width}·证据和选项无横向溢出`, await page.locator('.visitor-workspace').evaluate(node => node.scrollWidth <= node.clientWidth));
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
        check(`${prefix}·真实入口自动挂载一次`, await page.locator('.visitor-experience').count() === 1 && await page.locator('#visitor-map').count() === 1);
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
