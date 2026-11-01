/* ============================================================
 * app.js — 界面控制与流程编排
 * 依赖 game.js (GomokuGame)、ai.js (GomokuAI)
 * 负责：视图切换、难度选择、排行榜（localStorage）、结算弹窗
 * ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'gomoku_leaderboard_v1';
  var MUTE_KEY = 'gomoku_muted_v1';
  var DIFF_LABELS = { easy: '简单', medium: '中等', hard: '困难', boss: '影子分身', terrain: '地形吞噬' };

  /* ---------- DOM 缓存 ---------- */
  var views = {
    home: document.getElementById('view-home'),
    difficulty: document.getElementById('view-difficulty'),
    game: document.getElementById('view-game'),
    leaderboard: document.getElementById('view-leaderboard')
  };

  var els = {
    playerName: document.getElementById('player-name'),
    diffError: document.getElementById('diff-error'),
    gamePlayer: document.getElementById('game-player'),
    gameDiff: document.getElementById('game-diff'),
    gameSteps: document.getElementById('game-steps'),
    status: document.getElementById('status'),
    board: document.getElementById('board'),
    aiReason: document.getElementById('ai-reason'),
    moveLog: document.getElementById('move-log'),
    moveEmpty: document.getElementById('move-empty'),
    btnUndo: document.getElementById('btn-undo'),
    btnMute: document.getElementById('btn-mute'),
    btnReplay: document.getElementById('btn-replay'),
    btnResult: document.getElementById('btn-result'),
    btnRestart: document.getElementById('btn-restart'),
    replayBar: document.getElementById('replay-bar'),
    rpFirst: document.getElementById('rp-first'),
    rpPrev: document.getElementById('rp-prev'),
    rpPlay: document.getElementById('rp-play'),
    rpNext: document.getElementById('rp-next'),
    rpLast: document.getElementById('rp-last'),
    rpExit: document.getElementById('rp-exit'),
    rpCount: document.getElementById('rp-count'),
    rpRange: document.getElementById('rp-range'),
    rankBody: document.getElementById('rank-body'),
    rankEmpty: document.getElementById('rank-empty'),
    btnClearRank: document.getElementById('btn-clear-rank'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalText: document.getElementById('modal-text'),
    modalAgain: document.getElementById('modal-again'),
    modalReview: document.getElementById('modal-review'),
    modalRank: document.getElementById('modal-rank')
  };

  // 保存最近一局的结算信息，供“查看棋局”后重新唤出结果
  var lastResult = null;

  /* ---------- 当前对局上下文 ---------- */
  var state = {
    playerName: '',
    difficulty: 'medium',
    mode: 'normal',
    currentFilter: 'all',
    muted: (function () {
      try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
    })()
  };

  var game = null; // GomokuGame 实例，进入游戏时创建

  /* ---------- 视图切换 ---------- */
  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].classList.toggle('active', key === name);
    });
    if (name === 'leaderboard') renderLeaderboard();
  }

  /* ============================================================
   * 排行榜数据层（localStorage）
   * 记录结构：{ name, difficulty, steps, date }
   * 仅保存玩家获胜的记录
   * ============================================================ */
  function loadRecords() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (e) {
      /* 存储不可用时静默失败 */
    }
  }

  function addRecord(record) {
    var records = loadRecords();
    records.push(record);
    saveRecords(records);
  }

  function clearRecords() {
    saveRecords([]);
  }

  /* ---------- 排行榜渲染 ---------- */
  function renderLeaderboard() {
    var records = loadRecords();

    // 过滤
    if (state.currentFilter !== 'all') {
      records = records.filter(function (r) {
        return r.difficulty === state.currentFilter;
      });
    }

    // 排序：步数少者优先；步数相同按时间早者优先
    records.sort(function (a, b) {
      if (a.steps !== b.steps) return a.steps - b.steps;
      return (a.date || 0) - (b.date || 0);
    });

    els.rankBody.innerHTML = '';

    if (records.length === 0) {
      els.rankEmpty.style.display = 'block';
      return;
    }
    els.rankEmpty.style.display = 'none';

    var medals = ['🥇', '🥈', '🥉'];
    records.forEach(function (r, idx) {
      var tr = document.createElement('tr');

      var rankCell = idx < 3
        ? '<span class="rank-medal">' + medals[idx] + '</span>'
        : (idx + 1);

      var diff = r.difficulty || 'medium';
      var diffLabel = DIFF_LABELS[diff] || diff;

      tr.innerHTML =
        '<td>' + rankCell + '</td>' +
        '<td><div class="rank-name">' + escapeHtml(r.name) + '</div></td>' +
        '<td><span class="badge ' + diff + '">' + diffLabel + '</span></td>' +
        '<td>' + r.steps + '</td>';
      els.rankBody.appendChild(tr);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ============================================================
   * 右侧面板：电脑思路 + 落子记录
   * ============================================================ */
  var TACTIC_CLASS = {
    '开局': 'tac-open', '制胜': 'tac-win', '防守': 'tac-defend',
    '进攻': 'tac-attack', '推演': 'tac-think', '贪心': 'tac-attack',
    '试探': 'tac-open', '思考': 'tac-think', '算杀': 'tac-win',
    '双子': 'tac-boss'
  };

  // 渲染电脑的落子思路（方法论）
  function renderAIReason(info) {
    var cls = TACTIC_CLASS[info.tactic] || 'tac-think';
    els.aiReason.innerHTML =
      '<p class="ai-tactic ' + cls + '">' +
        '<span class="tactic-tag">' + escapeHtml(info.tactic) + '</span>' +
        '<span class="ai-coord">落子 ' + escapeHtml(info.coord) + '</span>' +
      '</p>' +
      '<p class="ai-text">' + escapeHtml(info.reason) + '</p>';
  }

  // 追加一条落子记录
  function appendMove(m) {
    els.moveEmpty.style.display = 'none';
    var li = document.createElement('li');
    li.className = 'move-item ' + (m.player === 'human' ? 'move-human' : 'move-ai');
    li.innerHTML =
      '<span class="move-idx">' + m.index + '</span>' +
      '<span class="move-side">' +
        '<span class="mini-stone ' + (m.player === 'human' ? 'black' : 'white') + '"></span>' +
        (m.player === 'human' ? '你（黑）' : '白（电脑）') +
      '</span>' +
      '<span class="move-coord">' + escapeHtml(m.coord) + '</span>';
    els.moveLog.appendChild(li);
    // 滚动到最新一手
    els.moveLog.scrollTop = els.moveLog.scrollHeight;
  }

  // 依据当前棋局记录重建整个落子列表（悔棋后调用）
  function rebuildMoveLog() {
    els.moveLog.innerHTML = '';
    var log = game ? game.getMoveLog() : [];
    if (log.length === 0) {
      els.moveEmpty.style.display = 'block';
      return;
    }
    log.forEach(appendMove);
  }

  // 高亮落子记录中的第 idx 手（1-based）；idx<=0 时清除高亮
  function highlightMove(idx) {
    var items = els.moveLog.querySelectorAll('.move-item');
    for (var i = 0; i < items.length; i++) {
      var on = (i + 1) === idx;
      items[i].classList.toggle('replay-current', on);
      if (on && items[i].scrollIntoView) {
        items[i].scrollIntoView({ block: 'nearest' });
      }
    }
  }

  // 依据回放状态刷新控制条（由 game 通过 onReplay 推送）
  function renderReplay(rp) {
    // 非回放模式：隐藏控制条，清除记录高亮
    if (!rp.active) {
      els.replayBar.style.display = 'none';
      highlightMove(0);
      return;
    }
    els.replayBar.style.display = '';
    els.rpCount.textContent = rp.index + ' / ' + rp.total;
    els.rpRange.max = rp.total;
    els.rpRange.value = rp.index;
    els.rpPlay.textContent = rp.playing ? '⏸' : '▶';
    els.rpPlay.classList.toggle('playing', rp.playing);
    highlightMove(rp.index);
  }

  // 复位面板（新对局 / 重新开始）
  function resetPanels() {
    els.moveLog.innerHTML = '';
    els.moveEmpty.style.display = 'block';
    els.aiReason.innerHTML =
      '<p class="ai-tactic">等待开局</p>' +
      '<p class="ai-text">你先落子，我会在这里说明每一手的思路。</p>';
  }

  /* ============================================================
   * 游戏启动
   * ============================================================ */
  function startGame(difficulty, mode) {
    mode = mode || 'normal';
    state.mode = mode;
    // 特殊模式（Boss / 地形吞噬）在排行榜中各自作为独立难度记录
    state.difficulty = mode === 'normal' ? difficulty : mode;

    // 顶部信息
    var diffLabel = DIFF_LABELS[state.difficulty] || state.difficulty;
    els.gamePlayer.textContent = '玩家：' + state.playerName;
    els.gameDiff.textContent = (mode === 'normal' ? '难度：' : '模式：') + diffLabel;
    els.gameSteps.textContent = '步数：0';

    // 创建 / 复用实例
    if (!game) {
      game = new GomokuGame(els.board, {
        onStatus: function (text, cls) {
          els.status.textContent = text;
          els.status.className = 'status' + (cls ? ' ' + cls : '');
        },
        onStep: function (count) {
          els.gameSteps.textContent = '步数：' + count;
        },
        onGameOver: handleGameOver,
        onAIReason: renderAIReason,
        onMove: appendMove,
        onReset: resetPanels,
        onReplay: renderReplay
      });
    }
    game.setDifficulty(difficulty);
    if (game.setMode) game.setMode(mode);
    if (game.setMuted) game.setMuted(state.muted); // 同步静音状态
    game.reset();

    // 新对局：清除上一局结果，隐藏“查看结果”“复盘”按钮
    lastResult = null;
    els.btnResult.style.display = 'none';
    els.btnReplay.style.display = 'none';
    // 地形吞噬中塌陷不可逆，悔棋会与地形错位，故隐藏悔棋按钮
    els.btnUndo.style.display = (mode === 'terrain') ? 'none' : '';

    showView('game');
  }

  function handleGameOver(result) {
    if (result.winner === 'human') {
      // 记录进排行榜
      addRecord({
        name: state.playerName,
        difficulty: state.difficulty,
        steps: result.steps,
        date: Date.now()
      });
      if (state.mode === 'boss') {
        lastResult = {
          title: '击败 Boss 🎉',
          text: '你以 ' + result.steps + ' 步率先连成四子，' +
            '在不平等对局中战胜了「影子分身」！'
        };
      } else if (state.mode === 'terrain') {
        lastResult = {
          title: '绝境求生 🎉',
          text: '你以 ' + result.steps + ' 步在不断塌陷的战场上抢先连成五子，' +
            '于熔岩吞噬前锁定胜局！'
        };
      } else {
        lastResult = {
          title: '胜利 🎉',
          text: '你以 ' + result.steps + ' 步击败了「' +
            (DIFF_LABELS[state.difficulty] || state.difficulty) + '」难度电脑！'
        };
      }
    } else if (result.winner === 'ai') {
      if (state.mode === 'boss') {
        lastResult = { title: '惜败', text: '影子分身抢先连成五子，再来一局挑战吧。' };
      } else if (state.mode === 'terrain') {
        lastResult = { title: '惜败', text: '电脑在熔岩逼近前先连成五子，再来一局。' };
      } else {
        lastResult = { title: '惜败', text: '电脑连成五子，再来一局试试吧。' };
      }
    } else {
      lastResult = state.mode === 'terrain'
        ? { title: '平局', text: '战场被熔岩吞没，双方都没能连成五子。' }
        : { title: '平局', text: '棋盘已满，势均力敌。' };
    }
    openModal(lastResult.title, lastResult.text);
    // 对局已结束，露出“查看结果”“复盘”按钮
    els.btnResult.style.display = '';
    if (result.winner !== 'draw' || game.history.length > 0) {
      els.btnReplay.style.display = '';
    }
  }

  // 重新开始一局：复位棋盘并清理上一局结果状态
  function restartGame() {
    if (!game) return;
    if (game.exitReplay) game.exitReplay();
    game.reset();
    lastResult = null;
    els.btnResult.style.display = 'none';
    els.btnReplay.style.display = 'none';
  }

  /* ---------- 结算弹窗 ---------- */
  function openModal(title, text) {
    els.modalTitle.textContent = title;
    els.modalText.textContent = text;
    els.modal.classList.add('show');
  }
  function closeModal() {
    els.modal.classList.remove('show');
  }

  /* ============================================================
   * 事件绑定
   * ============================================================ */
  function bindEvents() {
    // data-goto 通用跳转
    document.querySelectorAll('[data-goto]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        showView(btn.getAttribute('data-goto'));
      });
    });

    // 难度选择
    document.querySelectorAll('.diff-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = (els.playerName.value || '').trim();
        if (!name) {
          els.diffError.textContent = '请先输入你的姓名';
          els.playerName.focus();
          return;
        }
        els.diffError.textContent = '';
        state.playerName = name;
        startGame(btn.getAttribute('data-diff'), btn.getAttribute('data-mode'));
      });
    });

    // 清空姓名输入时的错误提示
    els.playerName.addEventListener('input', function () {
      if (els.playerName.value.trim()) els.diffError.textContent = '';
    });

    // 游戏控制
    els.btnUndo.addEventListener('click', function () {
      if (game && game.undo()) rebuildMoveLog();
    });
    els.btnRestart.addEventListener('click', restartGame);

    // 音效开关：状态持久化到 localStorage，进入游戏时同步给实例
    els.btnMute.addEventListener('click', function () {
      state.muted = !state.muted;
      if (game && game.setMuted) game.setMuted(state.muted);
      try { localStorage.setItem(MUTE_KEY, state.muted ? '1' : '0'); } catch (e) {}
      updateMuteBtn();
    });

    // 复盘后重新唤出结算弹窗
    els.btnResult.addEventListener('click', function () {
      if (lastResult) openModal(lastResult.title, lastResult.text);
    });

    // 复盘：进入回放模式
    els.btnReplay.addEventListener('click', function () {
      if (game && game.startReplay) game.startReplay();
    });

    // 回放控制条
    els.rpFirst.addEventListener('click', function () { if (game) game.replayFirst(); });
    els.rpPrev.addEventListener('click', function () { if (game) game.replayPrev(); });
    els.rpPlay.addEventListener('click', function () { if (game) game.replayToggle(); });
    els.rpNext.addEventListener('click', function () {
      if (game) { game.replayPause(); game.replayNext(); }
    });
    els.rpLast.addEventListener('click', function () { if (game) game.replayLast(); });
    els.rpExit.addEventListener('click', function () { if (game) game.exitReplay(); });
    els.rpRange.addEventListener('input', function () {
      if (game) { game.replayPause(); game.replaySeek(parseInt(els.rpRange.value, 10) || 0); }
    });

    // 排行榜筛选
    document.querySelectorAll('.filter-tabs .tab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        document.querySelectorAll('.filter-tabs .tab').forEach(function (t) {
          t.classList.remove('active');
        });
        tab.classList.add('active');
        state.currentFilter = tab.getAttribute('data-filter');
        renderLeaderboard();
      });
    });

    // 清空排行榜
    els.btnClearRank.addEventListener('click', function () {
      if (confirm('确定清空全部排行榜记录吗？此操作不可恢复。')) {
        clearRecords();
        renderLeaderboard();
      }
    });

    // 弹窗按钮
    els.modalAgain.addEventListener('click', function () {
      closeModal();
      restartGame();
    });
    // 查看棋局：关闭弹窗并直接进入复盘回放
    els.modalReview.addEventListener('click', function () {
      closeModal();
      if (game && game.startReplay) game.startReplay();
    });
    els.modalRank.addEventListener('click', function () {
      closeModal();
      showView('leaderboard');
    });
  }

  // 刷新音效按钮的图标与文字
  function updateMuteBtn() {
    if (!els.btnMute) return;
    els.btnMute.textContent = state.muted ? '🔇 静音' : '🔊 音效';
    els.btnMute.classList.toggle('muted', state.muted);
  }

  /* ---------- 初始化 ---------- */
  bindEvents();
  updateMuteBtn();
  showView('home');
})();
