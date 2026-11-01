import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {EXHIBITS} from '../assets/museum-data.mjs';
import {createLab, LABS} from '../assets/labs.mjs';
import {
  ROLE_MISSIONS, VISITOR_STOPS, createRoleState, reduceRole, roleReview,
  createVisitorState, reduceVisitor, mountVisitorExperience
} from '../assets/visitor-experience.mjs';

const frozenState = value => {
  Object.values(value).forEach(item => { if (item && typeof item === 'object') frozenState(item); });
  return Object.freeze(value);
};
const solveStage = state => {
  const stage = ROLE_MISSIONS.find(role => role.id === state.roleId).stages[state.stage];
  return reduceRole(reduceRole(state, 'inspect'), 'answer', stage.answer);
};

test('import and pure state transitions never access browser globals', () => {
  const url = new URL('../assets/visitor-experience.mjs', import.meta.url).href;
  const script = `for (const name of ['document','window','localStorage']) Object.defineProperty(globalThis,name,{get(){throw Error('DOM access: '+name)}}); const m=await import(${JSON.stringify(url)}); m.createRoleState();m.createVisitorState();`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('map stations use the existing five routes and ordered exhibit names', () => {
  assert.deepEqual(VISITOR_STOPS.map(stop => [stop.id, stop.number, stop.name]), EXHIBITS);
  assert.ok(VISITOR_STOPS.every(stop => stop.hash === `#${stop.id}` && stop.narration && stop.prompt));
  assert.equal(VISITOR_STOPS.length, 5);
});

test('all three professional roles have three evidence-based stages and specific feedback', () => {
  assert.deepEqual(ROLE_MISSIONS.map(role => role.name), ['研究员', '系统工程师', '对局分析师']);
  for (const role of ROLE_MISSIONS) {
    assert.equal(role.stages.length, 3);
    assert.ok(role.brief && role.takeaway);
    for (const stage of role.stages) {
      assert.ok(stage.action && stage.evidence && stage.question && stage.situation);
      assert.equal(stage.options.length, 3);
      assert.equal(new Set(stage.options.map(option => option.id)).size, 3);
      assert.ok(stage.options.every(option => option.feedback.length > 15));
      assert.equal(stage.options.filter(option => option.id === stage.answer).length, 1);
      assert.ok(VISITOR_STOPS.some(stop => stop.id === stage.route));
    }
  }
});

test('authored data is immutable and invalid role ids are rejected', () => {
  assert.throws(() => { ROLE_MISSIONS[0].stages[0].answer = 'other'; }, TypeError);
  assert.throws(() => { VISITOR_STOPS.push({}); }, TypeError);
  assert.throws(() => createRoleState('child'), RangeError);
});

for (const role of ROLE_MISSIONS) {
  test(`${role.name}: cannot skip evidence, answer or an unfinished stage`, () => {
    let state = createRoleState(role.id);
    assert.equal(reduceRole(state, 'next'), state);
    state = reduceRole(state, 'answer', role.stages[0].answer);
    assert.equal(state.passed, false);
    assert.equal(state.stage, 0);
    assert.match(state.feedback, /尚未取证/);
    assert.equal(state.records.length, 0);
    state = reduceRole(state, 'inspect');
    assert.equal(reduceRole(state, 'next'), state);
    assert.equal(reduceRole(state, 'answer', 'invalid'), state);
    assert.equal(roleReview(state), null);
  });

  test(`${role.name}: wrong answers explain the issue, allow correction, and appear in review`, () => {
    let state = createRoleState(role.id);
    for (let index = 0; index < 3; index++) {
      const stage = role.stages[index];
      const wrong = stage.options.find(option => option.id !== stage.answer);
      state = reduceRole(state, 'inspect');
      const incorrect = reduceRole(frozenState(state), 'answer', wrong.id);
      assert.equal(incorrect.passed, false);
      assert.match(incorrect.feedback, /需要修正/);
      assert.ok(incorrect.feedback.includes(wrong.feedback));
      assert.equal(reduceRole(incorrect, 'next'), incorrect);
      state = reduceRole(frozenState(incorrect), 'answer', stage.answer);
      assert.equal(state.passed, true);
      assert.equal(reduceRole(state, 'answer', wrong.id), state);
      state = reduceRole(frozenState(state), 'next');
      if (index < 2) {
        assert.equal(state.stage, index + 1);
        assert.equal(state.inspected, false);
        assert.equal(state.passed, false);
      }
    }
    assert.equal(state.complete, true);
    assert.equal(state.records.length, 6);
    const review = roleReview(state);
    assert.equal(review.name, role.name);
    assert.equal(review.corrections, 3);
    assert.ok(review.stages.every(stage => stage.attempts === 2 && stage.conclusion));
    assert.equal(reduceRole(state, 'next'), state);
    assert.equal(reduceRole(state, 'inspect'), state);
    assert.equal(reduceRole(state, 'answer', 'anything'), state);
    assert.deepEqual(reduceRole(state, 'restart'), createRoleState(role.id));
  });
}

test('role progress is independent of the original six labs and other roles', () => {
  const lab = frozenState(createLab());
  const originalLab = JSON.stringify(lab);
  const engineer = frozenState(createRoleState('engineer'));
  let researcher = createRoleState('researcher');
  for (let i = 0; i < 3; i++) researcher = reduceRole(solveStage(researcher), 'next');
  assert.equal(researcher.complete, true);
  assert.deepEqual(engineer, createRoleState('engineer'));
  assert.equal(JSON.stringify(lab), originalLab);
  assert.equal(LABS.length, 6);
});

test('visited state sanitizes persisted data and returns fresh containers', () => {
  for (const value of [null, {}, 'origins', 5]) assert.deepEqual(createVisitorState(value).visited, []);
  const input = ['growth', 'origins', 'growth', 'unknown', '<script>'];
  const state = createVisitorState(input);
  assert.deepEqual(state.visited, ['origins', 'growth']);
  state.visited.push('match');
  assert.equal(input.length, 5);
  assert.deepEqual(createVisitorState().visited, []);
});

test('free visits record actual valid routes, including legacy aliases, once', () => {
  let state = frozenState(createVisitorState());
  assert.equal(reduceVisitor(state, 'visit', '#bogus'), state);
  assert.equal(reduceVisitor(state, 'visit', null), state);
  for (const hash of ['#history', '#model', '#labs', '#experiments']) {
    state = frozenState(reduceVisitor(state, 'visit', hash));
  }
  assert.deepEqual(state.visited, ['origins', 'dimensions', 'growth']);
  assert.equal(state.active, false);
  assert.equal(state.index, 0);
  assert.equal(state.finished, false);
});

test('guide is entirely manual, clamps bounds and records five visited stops', () => {
  let state = frozenState(createVisitorState());
  assert.equal(reduceVisitor(state, 'next'), state);
  assert.equal(reduceVisitor(state, 'previous'), state);
  state = frozenState(reduceVisitor(state, 'start'));
  assert.equal(state.active, true);
  assert.deepEqual(state.visited, ['origins']);
  assert.equal(reduceVisitor(state, 'previous'), state);
  assert.equal(reduceVisitor(state, 'tick', 99999), state);
  for (let index = 1; index < 5; index++) {
    state = frozenState(reduceVisitor(state, 'next'));
    assert.equal(state.index, index);
    assert.equal(state.active, true);
    assert.equal(state.finished, false);
  }
  assert.equal(reduceVisitor(state, 'next'), state);
  assert.equal(state.visited.length, 5);
  state = frozenState(reduceVisitor(state, 'previous'));
  assert.equal(state.index, 3);
  assert.equal(state.visited.length, 5);
  state = reduceVisitor(reduceVisitor(state, 'next'), 'end');
  assert.equal(state.active, false);
  assert.equal(state.finished, true);
});

test('ending a guide early retains visits and does not claim completion', () => {
  const state = reduceVisitor(reduceVisitor(reduceVisitor(createVisitorState(), 'start'), 'next'), 'end');
  assert.equal(state.active, false);
  assert.equal(state.finished, false);
  assert.deepEqual(state.visited, ['origins', 'match']);
  const restarted = reduceVisitor(state, 'start');
  assert.equal(restarted.index, 0);
  assert.deepEqual(restarted.visited, state.visited);
});

test('ordinary route changes during a guide never silently advance its station', () => {
  const state = reduceVisitor(createVisitorState(), 'start');
  const next = reduceVisitor(frozenState(state), 'visit', '#experiments');
  assert.equal(next.index, 0);
  assert.equal(next.active, true);
  assert.deepEqual(next.visited, ['origins', 'growth']);
});

test('mount reports its browser and routing requirements without global side effects', () => {
  assert.throws(() => mountVisitorExperience(), /navigate/);
  assert.throws(() => mountVisitorExperience({navigate() {}}), /浏览器文档/);
});

test('renderer contains no inline script/style or scene ownership violations', async () => {
  const source = await readFile(new URL('../assets/visitor-experience.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /<script\b|\bstyle\s*=|\bon(?:click|keydown|input)\s*=/i);
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /scene\s*(?:\?\.)?\s*\.?(?:show|dispose)\s*\(/);
  assert.doesNotMatch(source, /setInterval|setTimeout|requestAnimationFrame/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /on\(dialog, 'close'/);
});

test('all CSS selectors stay scoped to visitor classes, including responsive rules', async () => {
  const css = await readFile(new URL('../visitor.css', import.meta.url), 'utf8');
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    const selector = match[1].trim();
    if (selector.startsWith('@')) continue;
    for (const part of selector.split(',')) assert.match(part.trim(), /^\.visitor-[a-z-]+/, part);
  }
  assert.doesNotMatch(css, /@import|url\(|animation\s*:/);
});
