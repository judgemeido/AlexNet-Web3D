import {EXHIBITS} from './museum-data.mjs';

// Teaching scenarios are authored for this exhibition; none is a historical transcript.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const option = (id, text, feedback) => ({id, text, feedback});

export const ROLE_MISSIONS = freeze([
  {
    id: 'researcher', name: '研究员', subtitle: '把学习结果变成可检验的证据',
    brief: '你负责一项虚构的棋盘评估研究。提交实验方案前，依次核查数据、参数更新和结论边界。',
    takeaway: '可靠研究需要隔离评估数据、区分训练与推理，并让结论与证据的范围一致。',
    stages: [
      {
        title: '划定数据边界', route: 'dimensions',
        situation: '档案中有同一盘棋的多个相邻局面。你要划分训练集与评估集，检验对未见对局的表现。',
        action: '核查样本来源',
        evidence: '合成档案：对局 A 含局面 A01、A02；对局 B 含 B01、B02。相邻局面高度相关，逐局面随机拆分可能把同盘信息带入评估。',
        question: '怎样划分，才能更合理地检验对未见对局的泛化？', answer: 'games',
        options: [
          option('positions', 'A01、B01 用于训练；A02、B02 用于评估', '同盘的相邻局面跨越了两个集合，可能让评估过于乐观。请按对局隔离。'),
          option('games', '整盘 A 用于训练；整盘 B 留作评估', '已按对局隔离。真实研究还需更多对局、独立测试集及一致的评估协议。'),
          option('reuse', '全部用于训练，再在同一批数据上报告泛化', '训练数据上的表现不能直接证明对未见对局的泛化。')
        ]
      },
      {
        title: '执行一次参数更新', route: 'growth',
        situation: '用一个标量实验检查反馈方向：输入 x = 0.8，目标 y = 0.9，初始权重 w = 0.15，学习率 0.22，损失为平方误差。',
        action: '计算一次梯度更新',
        evidence: '预测 0.1200；梯度 2 × (0.12 − 0.9) × 0.8 = −1.2480；新权重 0.42456；新预测 0.339648。损失由 0.6084 降至约 0.3140。',
        question: '这次操作改变了什么？', answer: 'weight',
        options: [
          option('search', '只增加了搜索树的访问次数', '本次计算更新的是权重，没有维护搜索树。回传访问统计属于另一类操作。'),
          option('weight', '依据误差调整权重，改变下一次预测', '参数按负梯度方向调整。本例只验证一个样本上的数值更新，不等于训练出围棋能力。'),
          option('target', '把目标值改为当前预测，从而消除误差', '目标没有被改写。用预测替换目标会丢失原来的学习约束。')
        ]
      },
      {
        title: '签署研究结论', route: 'growth',
        situation: '研究笔记显示：刚才的单样本损失下降；尚未进行独立对局测试，也没有完整围棋规则引擎。',
        action: '审阅证据清单',
        evidence: '已验证：单权重更新与局部损失变化。未验证：合法落子、提子、整盘胜负、泛化表现。没有加载历史系统的训练权重。',
        question: '哪一句可以写进结论？', answer: 'bounded',
        options: [
          option('master', '系统已经掌握围棋，并能复现比赛棋力', '现有实验没有整盘评测，也没有完整系统，无法支持棋力或历史复现的结论。'),
          option('bounded', '这个局部实验展示了误差反馈如何改变参数', '结论与证据一致。下一步应设定独立评测，而不是把局部数值现象扩大为智能证明。'),
          option('always', '一次损失下降证明模型以后不会出错', '单样本、单次更新不能保证未来表现，更不能保证所有输入均正确。')
        ]
      }
    ]
  },
  {
    id: 'engineer', name: '系统工程师', subtitle: '沿数据路径排查性能与职责',
    brief: '你负责一套虚构的展陈计算平台。检查任务分配、识别数据瓶颈，最后写出上线说明。',
    takeaway: '计算、存储和调度共同决定运行条件；硬件升级与网络学习需要分别验证。',
    stages: [
      {
        title: '分配计算职责', route: 'match',
        situation: '棋盘编码已到达任务队列：搜索需要维护分支统计，网络评估需要重复执行大量张量乘加。',
        action: '追踪一次评估请求',
        evidence: '教学链路：状态编码 → 搜索调度 → 网络批量评估 → 结果回传。通用处理器适合控制逻辑；加速器适合大批相似数值运算。实际分工取决于实现。',
        question: '在这套教学平台上，怎样分工最合理？', answer: 'cooperate',
        options: [
          option('fan', '让风扇决定候选落子', '风扇负责气流和散热，不执行候选评估或搜索调度。'),
          option('cooperate', '通用处理器组织搜索，加速器执行批量网络评估', '控制与数值计算协作，存储和互联继续为两者供数；这不是历史硬件的精确部署记录。'),
          option('memory', '增加存储容量就能代替全部计算', '容量解决可存放的数据规模，不能代替执行指令和数值运算。')
        ]
      },
      {
        title: '诊断数据瓶颈', route: 'growth',
        situation: '合成监测记录显示：每批计算用时 4 ms，等待数据用时 12 ms。暂按串行阶段相加估计，不考虑重叠。',
        action: '对照两种升级方案',
        evidence: '原耗时 4 + 12 = 16 ms。计算减半：2 + 12 = 14 ms。等待减半：4 + 6 = 10 ms。这是理想化估算，不是设备实测。',
        question: '在给定条件下，哪项优化更值得优先验证？', answer: 'supply',
        options: [
          option('cores', '只把计算速度翻倍，因为核心总是瓶颈', '按记录仅降至 14 ms。等待占比更高，不能仅凭核心数量判断瓶颈。'),
          option('supply', '优先优化数据供应，把等待压到 6 ms', '估算降至 10 ms，比只加速计算更有效。实施后仍需实测并检查新瓶颈。'),
          option('capacity', '把容量翻倍，直接宣称耗时也减半', '容量与带宽、等待时间不是同一指标；题中没有支持这种性能承诺的测量。')
        ]
      },
      {
        title: '交付运行说明', route: 'decision',
        situation: '平台已完成加速。在一次使用固定权重的决策请求中，搜索会反复评估候选并更新访问统计。',
        action: '核对运行期间的变化',
        evidence: '本情境：网络权重保持固定；搜索树的访问次数与平均评估更新。训练任务才依据学习目标调整网络参数。硬件性能另行测量。',
        question: '交付文档应怎样区分推理、搜索与训练？', answer: 'separate',
        options: [
          option('learn', '每次搜索回传都自动改变网络权重', '搜索统计与网络参数是不同对象。本情境未执行训练更新。'),
          option('separate', '固定权重做评估，搜索更新统计，训练另行更新参数', '三种职责已分清。加速让计算更快，并不直接证明参数更优或系统更智能。'),
          option('speed', '运行更快已经证明棋力更高', '速度改善可能增加预算，但棋力仍需受控评测，不能直接等同。')
        ]
      }
    ]
  },
  {
    id: 'analyst', name: '对局分析师', subtitle: '把先验、搜索和历史证据分开',
    brief: '你为一份虚构的赛后机制报告核查推理链。候选甲乙均为合成符号，不对应任何比赛棋步。',
    takeaway: '先验引导候选，搜索积累统计，历史解释则需要独立的实战与文献证据。',
    stages: [
      {
        title: '区分第一印象与搜索判断', route: 'decision',
        situation: '合成候选甲的先验为 56%，乙为 29%。搜索后，甲访问 4 次、平均评估 0.43；乙访问 8 次、平均评估 0.73。',
        action: '调阅候选统计',
        evidence: '甲：先验 56% / 访问 4 / 均值 0.43。乙：先验 29% / 访问 8 / 均值 0.73。先验与搜索统计回答不同问题，评估均为教学设定。',
        question: '哪种解读保留了证据的层次？', answer: 'revise',
        options: [
          option('prior', '甲先验最高，因此搜索也必须选甲', '先验引导探索，不能预先锁定搜索结果。请同时查看访问与评估。'),
          option('revise', '乙获得更多访问和更高均值，搜索可以改变候选排序', '搜索可修正最初倾向；有限访问和估计值仍不足以证明某个落子必胜。'),
          option('win', '乙的 0.73 意味着这盘真实比赛必胜', '这是合成估计，既非历史比赛记录，也不是对实际终局的保证。')
        ]
      },
      {
        title: '核算一次回传', route: 'decision',
        situation: '固定同一评价视角：某分支此前访问 2 次、评估总和 1.0；新一次合成评估为 0.8。',
        action: '合并一次回传记录',
        evidence: '新访问数 2 + 1 = 3；新总和 1.0 + 0.8 = 1.8；新均值 1.8 ÷ 3 = 0.6。此例固定视角，省略真实对弈树的轮次转换。',
        question: '应登记哪一组统计？', answer: 'average',
        options: [
          option('replace', '访问 3 次，均值直接替换成 0.8', '这会丢掉已有两次评估。请先累加总和，再除以总访问数。'),
          option('average', '访问 3 次，总和 1.8，均值 0.6', '核算正确。回传累积的是搜索证据，本操作没有改变网络训练权重。'),
          option('sum', '访问仍为 2 次，均值为 1.8', '新评估需要增加访问次数；总和与均值也必须分开。')
        ]
      },
      {
        title: '撰写有边界的复盘', route: 'match',
        situation: '你准备把本次推演与主展厅的五番棋档案并置。推演不含比赛棋谱，也未执行历史模型推理。',
        action: '检查报告证据标签',
        evidence: '历史档案用于说明比赛背景；甲乙候选、先验和回传数据均由展陈编写。机制示意不能单独解释历史上某一手的因果。',
        question: '哪一种报告表述合适？', answer: 'distinguish',
        options: [
          option('replay', '本次甲乙候选完整复现了第二局第 37 手', '没有对应棋谱、历史权重和搜索记录，不能宣称复现实战决策。'),
          option('distinguish', '用合成数据解释搜索机制，实战解读另引棋谱和研究资料', '机制推演与历史档案的证据边界清楚；可以提出研究问题，但不编造历史内部记录。'),
          option('mind', '一次出人意料的选择证明机器具有主观意识', '落子行为与算法表现不足以证明主观意识。报告应停留在可支持的机制与结果。')
        ]
      }
    ]
  }
]);

const narratives = [
  ['从积累看转折', '沿历史章节查看规则、学习、数据与计算如何逐步汇合。2016 年是本展的入口，早期研究则说明突破所需的长期积累。', '观察：不同路线解决了什么问题？不要把视觉网络的结构直接当成围棋系统。'],
  ['从比赛看系统', '将五番棋的公开结果与旁边的计算原理模型对照。棋盘、调度、评估与互联共同参与决策，机架形状本身不能说明棋力。', '观察：切换对局档案，区分历史讲解与统一使用的合成棋形。'],
  ['从候选走到决策', '策略提出相对倾向，价值估计局面，搜索把有限预算分配到分支。手动执行选择、扩展、评估与回传，检查哪一刻统计发生变化。', '观察：最高先验是否始终等于搜索后的首选？估计为何仍不是胜负保证？'],
  ['把状态拆成平面', '对照图像颜色通道与棋盘状态编码。二者共享张量语言，但输入语义、任务目标和网络输出不同。原图像网络仍是独立示例。', '操作：切换棋盘编码、调整切片；留意简化三平面与完整历史编码的边界。'],
  ['区分计算与学习', '拆看加速计算、反馈更新与自我对弈。硬件改变执行条件，训练调整参数，自我对弈生成经验；三者需要不同的验证方法。', '观察：局部误差下降证明了什么？2016 年与后续零起点研究有哪些流程差异？'],
  ['用操作形成自己的结论', '六项数值实验、角色任务和复盘档案现在汇入成长系统的最后一层。你可以核查数据、计算或复盘证据，把观察转为可说明依据的判断。', '操作：完成一个三阶段角色任务，并读完复盘。教学数据不等于真实历史推理。']
];
export const VISITOR_STOPS = freeze(EXHIBITS.map(([id, number, name], index) => ({
  id, number, name, hash: `#${id}`, title: narratives[index][0],
  narration: narratives[index][1], prompt: narratives[index][2]
})));

export function createRoleState(roleId = 'researcher') {
  if (!ROLE_MISSIONS.some(role => role.id === roleId)) throw new RangeError('未知角色');
  return {roleId, stage: 0, inspected: false, passed: false, complete: false,
    feedback: '先执行取证操作，再根据证据作出判断。', records: []};
}

/** Pure, immutable task transitions. A correct answer cannot bypass evidence collection. */
export function reduceRole(state, event, value) {
  if (event === 'restart') return createRoleState(state.roleId);
  if (state.complete) return state;
  const stage = ROLE_MISSIONS.find(role => role.id === state.roleId)?.stages[state.stage];
  if (!stage) return state;
  if (event === 'inspect' && !state.inspected) return {...state, inspected: true,
    feedback: '取证完成。请比较选项，提交你的判断。'};
  if (event === 'answer' && !state.passed) {
    const choice = stage.options.find(item => item.id === value);
    if (!choice) return state;
    if (!state.inspected) return {...state, feedback: '尚未取证：请先执行上方操作，再作判断。'};
    const correct = value === stage.answer;
    return {...state, passed: correct, feedback: `${correct ? '判断成立' : '需要修正'}：${choice.feedback}`,
      records: [...state.records, {stage: state.stage, choice: value, correct}]};
  }
  if (event === 'next' && state.passed) {
    if (state.stage === 2) return {...state, complete: true};
    return {...state, stage: state.stage + 1, inspected: false, passed: false,
      feedback: '进入下一阶段。请先执行取证操作。'};
  }
  return state;
}

export function roleReview(state) {
  const role = ROLE_MISSIONS.find(item => item.id === state.roleId);
  if (!role || !state.complete) return null;
  return {name: role.name, takeaway: role.takeaway,
    corrections: state.records.filter(record => !record.correct).length,
    stages: role.stages.map((stage, index) => ({title: stage.title, evidence: stage.evidence,
      conclusion: stage.options.find(choice => choice.id === stage.answer).feedback,
      attempts: state.records.filter(record => record.stage === index).length}))};
}

const aliases = {history: 'origins', model: 'dimensions', labs: 'growth', experiments: 'growth'};
function stopIndex(hash) {
  if (typeof hash !== 'string') return -1;
  const key = hash.replace(/^#/, '');
  return VISITOR_STOPS.findIndex(stop => stop.id === (aliases[key] || key));
}
export function createVisitorState(visited = []) {
  const valid = Array.isArray(visited) ? visited : [];
  return {visited: VISITOR_STOPS.filter(stop => valid.includes(stop.id)).map(stop => stop.id),
    active: false, index: 0, finished: false};
}
const markVisit = (state, id) => state.visited.includes(id) ? state : {...state, visited: [...state.visited, id]};

/** Visits and guided progress are separate; ordinary navigation never advances a guide. */
export function reduceVisitor(state, event, value) {
  if (event === 'visit') {
    const index = stopIndex(value);
    return index < 0 ? state : markVisit(state, VISITOR_STOPS[index].id);
  }
  if (event === 'start') return markVisit({...state, active: true, index: 0, finished: false}, VISITOR_STOPS[0].id);
  if (event === 'end' && state.active) return {...state, active: false, finished: state.index === VISITOR_STOPS.length - 1};
  if (!state.active) return state;
  const delta = event === 'next' ? 1 : event === 'previous' ? -1 : 0;
  if (!delta) return state;
  const index = Math.max(0, Math.min(VISITOR_STOPS.length - 1, state.index + delta));
  if (index === state.index) return state;
  return markVisit({...state, index}, VISITOR_STOPS[index].id);
}

const mounts = new WeakMap();
const STORAGE_KEY = 'museum.visitor.visited.v1';
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));

/**
 * Mount after setupPages()/mountMuseum(), with visitor.css loaded by the host.
 * navigate receives a complete hash. The host router exclusively owns scene.show().
 * Progress lives for this mount; visited areas persist locally when storage is available.
 * Returns {openMap, destroy, getState}; calling twice returns the existing mount.
 */
export function mountVisitorExperience({scene, navigate} = {}) {
  if (typeof navigate !== 'function') throw new TypeError('请提供 navigate(hash) 路由函数');
  if (typeof document === 'undefined') throw new Error('挂载需要浏览器文档；纯状态接口可在 Node 中使用');
  const doc = document;
  if (mounts.has(doc)) return mounts.get(doc);
  const win = doc.defaultView;
  const host = doc.querySelector('#experiments-view');
  if (!host || !doc.body) throw new Error('请在五展区初始化后挂载：缺少 #experiments-view');
  let stored = [];
  try { stored = JSON.parse(win.localStorage.getItem(STORAGE_KEY) || '[]'); } catch { /* Private/file mode remains usable. */ }
  let visitor = createVisitorState(stored), roleId = 'researcher', destroyed = false, returnFocus = null;
  let guideMarkup = '', mapMarkup = '';
  const roles = Object.fromEntries(ROLE_MISSIONS.map(role => [role.id, createRoleState(role.id)]));
  const section = doc.createElement('section');
  section.className = 'visitor-experience';
  section.id = 'visitor-experience';
  section.setAttribute('aria-labelledby', 'visitor-title');
  section.innerHTML = `<header class="visitor-heading"><span class="visitor-kicker">参与式研习 / 三种专业视角</span><h2 class="visitor-title" id="visitor-title">成为问题的提出者。</h2><p class="visitor-copy">选择一个角色，完成取证、判断与复盘。每条任务包含三个阶段，可随时切换角色并保留本次进度。</p><p class="visitor-boundary">教学情境推演 · 人物职责与任务数据由展陈编写，不是历史人物经历、比赛实录或真实模型推理。</p></header><div class="visitor-role-list" aria-label="选择研习角色"></div><div class="visitor-workspace"></div>`;
  host.append(section);
  const roleList = section.querySelector('.visitor-role-list');
  const workspace = section.querySelector('.visitor-workspace');

  const tools = doc.createElement('aside');
  tools.className = 'visitor-tools';
  tools.setAttribute('aria-label', '全站参观工具');
  tools.innerHTML = `<div class="visitor-guide" hidden></div><button type="button" class="visitor-map-trigger" aria-haspopup="dialog" aria-controls="visitor-map">参观地图 <span class="visitor-visit-count"></span></button><p class="visitor-announcement" role="status" aria-live="polite"></p>`;
  doc.body.append(tools);
  const trigger = tools.querySelector('.visitor-map-trigger');
  const guide = tools.querySelector('.visitor-guide');
  const announcement = tools.querySelector('.visitor-announcement');
  const dialog = doc.createElement('dialog');
  dialog.id = 'visitor-map';
  dialog.className = 'visitor-dialog';
  dialog.setAttribute('aria-labelledby', 'visitor-map-title');
  dialog.setAttribute('aria-describedby', 'visitor-map-intro');
   dialog.innerHTML = `<div class="visitor-dialog-head"><span class="visitor-kicker">五区展陈 / 自由参观</span><button type="button" class="visitor-close" data-visitor-action="close" aria-label="关闭参观地图" autofocus>关闭 ×</button></div><h2 class="visitor-title" id="visitor-map-title">把线索，连成自己的路径。</h2><p class="visitor-copy" id="visitor-map-intro">自由选择任一展区，或从第一站开始手动讲解。已访问标记在本浏览器可用存储中保留；讲解只在你操作时前进。</p><div class="visitor-map-grid"></div><div class="visitor-map-footer"><span class="visitor-map-status"></span><button type="button" class="visitor-primary" data-visitor-action="start">开始五站讲解 →</button></div>`;
  doc.body.append(dialog);
  const mapGrid = dialog.querySelector('.visitor-map-grid');
  const status = dialog.querySelector('.visitor-map-status');
  const on = (target, name, handler) => { target.addEventListener(name, handler); cleanup.push(() => target.removeEventListener(name, handler)); };
  const cleanup = [];
  const focus = node => { if (node?.isConnected && !node.closest('[hidden]')) node.focus({preventScroll: true}); };
  const focusWorkspace = () => focus(workspace.querySelector('.visitor-stage-title, .visitor-review-title'));
  function persist() {
    try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(visitor.visited)); } catch { /* Session state still works. */ }
  }
  function refreshMap() {
    const current = stopIndex(win.location.hash);
    const markup = VISITOR_STOPS.map((stop, index) => `<button type="button" class="visitor-map-card" data-visitor-stop="${stop.id}" ${index === current ? 'aria-current="location"' : ''}><span class="visitor-stop-number">${stop.number}</span><span class="visitor-stop-name">${stop.name}</span><span class="visitor-copy">${stop.title}</span><span class="visitor-visit-label">${visitor.visited.includes(stop.id) ? '已访问' : '待参观'}${index === current ? ' · 当前展区' : ''}</span></button>`).join('');
    if (markup !== mapMarkup) { mapGrid.innerHTML = markup; mapMarkup = markup; }
     tools.querySelector('.visitor-visit-count').textContent = `${visitor.visited.length} / 5`;
     status.textContent = `已访问 ${visitor.visited.length} / 5 展区${visitor.finished ? ' · 五站讲解已完成' : ''}`;
  }
  function refreshGuide() {
    guide.hidden = !visitor.active;
    if (!visitor.active) { guide.replaceChildren(); guideMarkup = ''; return; }
    const stop = VISITOR_STOPS[visitor.index];
    const elsewhere = stopIndex(win.location.hash) !== visitor.index;
     const lastIndex = VISITOR_STOPS.length - 1;
     const markup = `<div class="visitor-guide-head"><span class="visitor-kicker">手动讲解 · ${visitor.index + 1} / ${VISITOR_STOPS.length}</span><button type="button" class="visitor-text-button" data-visitor-action="end">${visitor.index === lastIndex ? '结束讲解' : '提前结束'}</button></div><h2 class="visitor-guide-title" tabindex="-1">${stop.name} · ${stop.title}</h2><p class="visitor-copy">${stop.narration}</p><p class="visitor-prompt">${stop.prompt}</p><div class="visitor-guide-actions"><button type="button" class="visitor-secondary" data-visitor-action="previous" ${visitor.index === 0 ? 'disabled' : ''}>← 上一站</button>${elsewhere ? '<button type="button" class="visitor-secondary" data-visitor-action="return">返回讲解展区</button>' : ''}<button type="button" class="visitor-primary" data-visitor-action="${visitor.index === lastIndex ? 'end' : 'next'}">${visitor.index === lastIndex ? '完成并结束' : '下一站 →'}</button>${visitor.index === 1 && typeof scene?.select === 'function' && !elsewhere ? '<button type="button" class="visitor-text-button" data-visitor-action="highlight">在模型中标注棋盘入口</button>' : ''}</div>`;
    if (markup !== guideMarkup) {
      const hadFocus = guide.contains(doc.activeElement);
      guide.innerHTML = markup; guideMarkup = markup;
      if (hadFocus) focus(guide.querySelector('.visitor-guide-title'));
    }
  }
  function visit(hash) {
    visitor = reduceVisitor(visitor, 'visit', hash);
    persist(); refreshMap(); refreshGuide();
  }
  function go(hash) {
    navigate(hash);
    visit(hash);
  }
  function closeMap() { if (dialog.open) dialog.close(); }
  function openMap() {
    if (destroyed || dialog.open) return;
    returnFocus = doc.activeElement;
    refreshMap();
    dialog.showModal();
  }
  function runGuide(action) {
    visitor = reduceVisitor(visitor, action);
    if (action === 'end') {
       announcement.textContent = visitor.finished ? '五站讲解已完成。可继续自由参观或进入角色研习。' : '讲解已结束，已访问记录保留。可继续自由参观。';
      refreshMap(); refreshGuide(); focus(trigger); return;
    }
    announcement.textContent = '';
    go(VISITOR_STOPS[visitor.index].hash);
    refreshGuide();
    focus(guide.querySelector('.visitor-guide-title'));
  }
  function renderRole() {
    const state = roles[roleId], role = ROLE_MISSIONS.find(item => item.id === roleId);
    const previousFeedback = workspace.querySelector('.visitor-feedback');
    roleList.innerHTML = ROLE_MISSIONS.map(item => `<button type="button" class="visitor-role-card" data-visitor-role="${item.id}" aria-pressed="${item.id === roleId}" aria-controls="visitor-role-content"><strong class="visitor-role-name">${item.name}</strong><span class="visitor-copy">${item.subtitle}</span><span class="visitor-role-progress">${roles[item.id].complete ? '已完成复盘' : `阶段 ${roles[item.id].stage + 1} / 3`}</span></button>`).join('');
    workspace.id = 'visitor-role-content';
    const review = roleReview(state);
    if (review) {
      workspace.innerHTML = `<span class="visitor-kicker">${role.name} / 研习档案已完成</span><h3 class="visitor-review-title" tabindex="-1">你的判断，形成了一条证据链。</h3><p class="visitor-copy">${review.takeaway}</p><p class="visitor-review-count">完成 3 / 3 阶段 · 提交 ${state.records.length} 次 · 修正 ${review.corrections} 次。修正用于复盘，不作为能力排名。</p><ol class="visitor-review-list">${review.stages.map(item => `<li class="visitor-review-item"><h4 class="visitor-review-heading">${item.title}</h4><p class="visitor-copy">${item.evidence}</p><p class="visitor-conclusion">${item.conclusion}</p><span class="visitor-attempts">本阶段提交 ${item.attempts} 次</span></li>`).join('')}</ol><p class="visitor-boundary">以上为展陈编写的情境推演。局部数值与判断不能代表真实比赛、真实设备性能或完整系统能力。</p><div class="visitor-task-actions"><button type="button" class="visitor-secondary" data-visitor-task="restart">重新研习此角色</button><button type="button" class="visitor-primary" data-visitor-task="map">打开参观地图 →</button></div>`;
      return;
    }
    const stage = role.stages[state.stage];
    workspace.innerHTML = `<div class="visitor-task-head"><span class="visitor-kicker">${role.name} / 阶段 ${state.stage + 1} / 3</span><button type="button" class="visitor-text-button" data-visitor-task="restart">重置此角色</button></div><h3 class="visitor-stage-title" tabindex="-1">${stage.title}</h3><p class="visitor-brief">${role.brief}</p><p class="visitor-situation">${stage.situation}</p><div class="visitor-evidence"><button type="button" class="visitor-secondary" data-visitor-task="inspect" ${state.inspected ? 'disabled' : ''}>${state.inspected ? '已执行：' : '执行：'}${stage.action}</button>${state.inspected ? `<p class="visitor-evidence-copy">${stage.evidence}</p>` : '<p class="visitor-copy">先执行操作，调出本阶段证据。</p>'}</div><fieldset class="visitor-choices" ${!state.inspected || state.passed ? 'disabled' : ''}><legend class="visitor-question">${stage.question}</legend>${stage.options.map(choice => `<button type="button" class="visitor-choice" data-visitor-answer="${choice.id}">${choice.text}</button>`).join('')}</fieldset><p class="visitor-feedback ${state.passed ? 'visitor-feedback-success' : ''}" role="status" aria-live="polite" aria-atomic="true">${escapeHTML(state.feedback)}</p><div class="visitor-task-actions"><button type="button" class="visitor-text-button" data-visitor-reference="${stage.route}">参照展区：${VISITOR_STOPS.find(stop => stop.id === stage.route).name} ↗</button><button type="button" class="visitor-primary" data-visitor-task="next" ${state.passed ? '' : 'disabled'}>${state.stage === 2 ? '生成最终复盘 →' : '进入下一阶段 →'}</button></div>`;
    if (previousFeedback) {
      const replacement = workspace.querySelector('.visitor-feedback');
      replacement.replaceWith(previousFeedback);
      previousFeedback.className = replacement.className;
      previousFeedback.textContent = state.feedback;
    }
  }

  on(trigger, 'click', openMap);
  on(dialog, 'close', () => { focus(returnFocus); if (!doc.activeElement || doc.activeElement === doc.body || dialog.contains(doc.activeElement)) focus(trigger); });
  on(dialog, 'click', event => {
    const button = event.target.closest('button');
    if (!button || !dialog.contains(button)) return;
    if (button.dataset.visitorAction === 'close') closeMap();
    if (button.dataset.visitorAction === 'start') { closeMap(); runGuide('start'); returnFocus = guide.querySelector('.visitor-guide-title'); }
    const id = button.dataset.visitorStop;
    if (id && VISITOR_STOPS.some(stop => stop.id === id)) {
      visitor = reduceVisitor(visitor, 'end');
      returnFocus = trigger; closeMap(); go(`#${id}`);
      announcement.textContent = `已前往${VISITOR_STOPS.find(stop => stop.id === id).name}，自由参观中。`;
    }
  });
  on(tools, 'click', event => {
    const action = event.target.closest('[data-visitor-action]')?.dataset.visitorAction;
    if (['previous', 'next', 'end'].includes(action)) runGuide(action);
    if (action === 'return') { go(VISITOR_STOPS[visitor.index].hash); focus(guide.querySelector('.visitor-guide-title')); }
    if (action === 'highlight') { scene?.select?.('board'); announcement.textContent = '已标注棋盘状态入口。请结合主展厅部件说明阅读。'; }
  });
  on(section, 'click', event => {
    const button = event.target.closest('button');
    if (!button || !section.contains(button)) return;
    const selected = button.dataset.visitorRole;
    if (selected && roles[selected]) { roleId = selected; renderRole(); focus(roleList.querySelector(`[data-visitor-role="${roleId}"]`)); return; }
    if (button.dataset.visitorReference) { go(`#${button.dataset.visitorReference}`); return; }
    const task = button.dataset.visitorTask;
    if (task === 'map') { openMap(); return; }
    const answer = button.dataset.visitorAnswer;
    if (!task && !answer) return;
    roles[roleId] = reduceRole(roles[roleId], answer ? 'answer' : task, answer);
    renderRole();
    if (task === 'next' || task === 'restart') focusWorkspace();
    else if (task === 'inspect') focus(workspace.querySelector('[data-visitor-answer]'));
    else if (answer) {
      if (roles[roleId].passed) focus(workspace.querySelector('[data-visitor-task="next"]'));
      else focus(workspace.querySelector(`[data-visitor-answer="${answer}"]`));
    }
  });
  on(win, 'hashchange', () => visit(win.location.hash));
  renderRole(); visit(win.location.hash);
  const api = {
    openMap,
    getState: () => ({visitor: {...visitor, visited: [...visitor.visited]}, roleId,
      roles: Object.fromEntries(Object.entries(roles).map(([id, state]) => [id, {...state, records: state.records.map(record => ({...record}))}]))}),
    destroy() {
      if (destroyed) return;
      destroyed = true;
      closeMap(); cleanup.forEach(remove => remove());
      if (section.contains(doc.activeElement) || tools.contains(doc.activeElement) || dialog.contains(doc.activeElement)) {
        focus(doc.querySelector('.main-nav a[aria-current="page"], .main-nav a'));
      }
      section.remove(); tools.remove(); dialog.remove(); mounts.delete(doc);
    }
  };
  mounts.set(doc, api);
  return api;
}
