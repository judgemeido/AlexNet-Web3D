/* ============================================================
 * game.js — 五子棋对局逻辑与棋盘渲染
 * 依赖 ai.js（GomokuAI）
 * 通过 new GomokuGame(canvas, options) 创建实例
 * options 回调：
 *   onStatus(text, cssClass)   状态提示
 *   onStep(count)              步数变化（玩家落子计一步）
 *   onGameOver(result)         结束：{ winner: 'human'|'ai'|'draw', steps }
 *   onMove(record)             每手落子：{ player:'human'|'ai', row, col, coord, index }
 *   onAIReason(info)           AI 落子思路：{ tactic, reason, coord }
 *   onReset()                  棋盘复位（清空记录/思路面板）
 * ============================================================ */
(function (global) {
  'use strict';

  var SIZE = 15;             // 15 路棋盘（默认）
  var EMPTY = 0;
  var HUMAN = 1;             // 玩家：黑，先手
  var AI = 2;                // 电脑：白
  var BLOCKED = 3;           // 地形吞噬：熔岩格（不可落子、吞噬已有棋子）

  // 地形吞噬模式参数
  var SHRINK_EVERY = 4;      // 每 4 手（玩家）塌陷一次外圈
  var MIN_SPAN = 6;          // 战场最小跨度（max-min），6 → 7×7 核心区不再塌陷

  // 落子动画时长（毫秒）
  var PLACE_ANIM = 200;

  // 高精度时间与 RAF 封装（用于落子弹入动画；缺失时回退到定时器）
  function now() {
    return (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
  }
  var raf = global.requestAnimationFrame
    ? global.requestAnimationFrame.bind(global)
    : function (fn) { return setTimeout(fn, 16); };
  var caf = global.cancelAnimationFrame
    ? global.cancelAnimationFrame.bind(global)
    : function (id) { clearTimeout(id); };

  /* ============================================================
   * 音效：用 Web Audio 实时合成，无需外部音频文件
   *   - 首次用户交互（落子）时才创建 AudioContext（浏览器策略要求）
   *   - 静音开关由外部通过 GomokuGame.setMuted 控制
   * ============================================================ */
  var Sound = (function () {
    var ctx = null;
    var muted = false;

    function ensure() {
      if (muted) return null;
      if (!ctx) {
        var AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        try { ctx = new AC(); } catch (e) { return null; }
      }
      // 某些浏览器初始为 suspended，交互后恢复
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      return ctx;
    }

    // 播放一个带音量包络的单音；type 波形，freq 频率，dur 时长(秒)
    function tone(freq, dur, type, gainPeak, startAt) {
      var ac = ensure();
      if (!ac) return;
      var t0 = ac.currentTime + (startAt || 0);
      var osc = ac.createOscillator();
      var gain = ac.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      // 快起快落的包络，模拟“清脆”感
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(gainPeak || 0.2, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    // 各音效的合成方案
    var effects = {
      // 玩家落子：清脆的落子声
      placeHuman: function () { tone(660, 0.12, 'triangle', 0.22); },
      // 电脑落子：略低沉，与玩家区分
      placeAI: function () { tone(440, 0.14, 'sine', 0.18); },
      // 胜利：上行三音
      win: function () {
        tone(523, 0.16, 'triangle', 0.25, 0);
        tone(659, 0.16, 'triangle', 0.25, 0.13);
        tone(784, 0.30, 'triangle', 0.28, 0.26);
      },
      // 失败：下行两音
      lose: function () {
        tone(392, 0.22, 'sine', 0.22, 0);
        tone(262, 0.40, 'sine', 0.22, 0.18);
      }
    };

    return {
      setMuted: function (m) {
        muted = !!m;
        if (muted && ctx && ctx.suspend) ctx.suspend();
        else if (!muted && ctx && ctx.resume) ctx.resume();
      },
      isMuted: function () { return muted; },
      // 统一入口：按名播放；静音时静默跳过
      play: function (name) {
        if (muted) return;
        var fn = effects[name];
        if (fn) fn();
      }
    };
  })();

  function GomokuGame(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = options || {};
    this.size = SIZE;
    this.difficulty = 'medium';
    this.mode = 'normal';       // 'normal' | 'boss'（影子分身）

    // 逻辑坐标基于固定的内部像素，CSS 负责缩放
    this.dpr = window.devicePixelRatio || 1;
    this.pixel = 450;                       // 内部绘制像素
    this.margin = 20;                       // 边距
    this.gap = (this.pixel - this.margin * 2) / (this.size - 1); // 线间距

    this._bindInput();
    this.reset();
  }

  GomokuGame.prototype.setDifficulty = function (diff) {
    this.difficulty = diff;
  };

  // 设置玩法模式：'normal'（常规）或 'boss'（影子分身）
  GomokuGame.prototype.setMode = function (mode) {
    this.mode = mode || 'normal';
  };

  // 某一方达成胜利所需的连子数：Boss 模式下玩家四连即胜，电脑仍需五连
  GomokuGame.prototype._winTarget = function (player) {
    if (this.mode === 'boss' && player === HUMAN) return 4;
    return 5;
  };

  /* ============================================================
   * 地形吞噬：活动战场为正方形区间 [terrainMin, terrainMax]，
   * 每 SHRINK_EVERY 手（玩家）最外圈塌陷为熔岩（BLOCKED），
   * 连同其上的棋子一并吞噬，直到收缩到 MIN_SPAN 的核心区为止。
   * 当前最外圈始终以“危险区”提示，AI 会规避在此经营棋形。
   * ============================================================ */

  // 当前战场跨度是否还能继续塌陷
  GomokuGame.prototype._terrainCanShrink = function () {
    return (this.terrainMax - this.terrainMin) > MIN_SPAN;
  };

  // 重新计算危险圈（下一次将塌陷的最外圈）并同步给 AI
  GomokuGame.prototype._terrainRefresh = function () {
    this.dangerSet = {};
    if (this.mode !== 'terrain' || !this._terrainCanShrink()) {
      if (global.GomokuAI && GomokuAI.setDangerZone) GomokuAI.setDangerZone(null);
      return;
    }
    var lo = this.terrainMin, hi = this.terrainMax;
    var cells = [];
    for (var r = lo; r <= hi; r++) {
      for (var c = lo; c <= hi; c++) {
        if (r === lo || r === hi || c === lo || c === hi) {
          this.dangerSet[r + ',' + c] = true;
          cells.push({ row: r, col: c });
        }
      }
    }
    if (global.GomokuAI && GomokuAI.setDangerZone) GomokuAI.setDangerZone(cells);
  };

  // 塌陷当前最外圈：圈上所有格（含棋子）化为熔岩，战场向内收缩一圈
  GomokuGame.prototype._collapseRing = function () {
    if (!this._terrainCanShrink()) return false;
    var lo = this.terrainMin, hi = this.terrainMax;
    for (var r = lo; r <= hi; r++) {
      for (var c = lo; c <= hi; c++) {
        if (r === lo || r === hi || c === lo || c === hi) {
          this.board[r][c] = BLOCKED;   // 吞噬：棋子/空格都化为熔岩
        }
      }
    }
    this.terrainMin++;
    this.terrainMax--;
    // 若“最近一手”标记落点已被熔岩吞噬，清除该标记避免画在熔岩上
    if (this.lastMove && this.board[this.lastMove.row][this.lastMove.col] === BLOCKED) {
      this.lastMove = null;
    }
    // 记录塌陷事件（以当前手数为界），供复盘按时序重建地形
    this.terrainEvents.push({
      ply: this.history.length,
      min: this.terrainMin,
      max: this.terrainMax
    });
    this._terrainRefresh();
    return true;
  };

  // 玩家落子后推进地形：达到节奏则塌陷一圈，返回是否发生塌陷
  GomokuGame.prototype._terrainTick = function () {
    if (this.mode !== 'terrain') return false;
    if (this.steps > 0 && this.steps % SHRINK_EVERY === 0) {
      return this._collapseRing();
    }
    return false;
  };

  GomokuGame.prototype.reset = function () {
    // 初始化空棋盘
    this.board = [];
    for (var r = 0; r < this.size; r++) {
      var row = [];
      for (var c = 0; c < this.size; c++) row.push(EMPTY);
      this.board.push(row);
    }
    this.history = [];        // 记录每步 { row, col, player }
    this.steps = 0;           // 玩家步数
    this.current = HUMAN;     // 玩家先手
    this.over = false;
    this.lastMove = null;
    this.winLine = null;      // 获胜连线，用于高亮
    this.bossTurnNo = 0;      // Boss 回合计数：每两回合才动用一次“双子天赋”

    // 地形吞噬：活动战场为一个正方形区间，随对局逐圈塌陷
    this.terrainMin = 0;
    this.terrainMax = this.size - 1;
    this.terrainEvents = [];  // 塌陷事件 { ply, cells, min, max }，供复盘重建
    this.dangerSet = {};      // 当前危险圈（即将塌陷）："r,c" -> true
    this._replayBounds = null;
    this._terrainRefresh();

    this._stopReplayTimer();
    this._stopAnim();          // 停止未播完的落子动画
    this.replay = { active: false, index: 0, playing: false }; // 复盘回放状态
    this._emitReplay();

    this._setupCanvas();
    this.draw();
    this._status('你的回合，请落子', '');
    if (this.opts.onStep) this.opts.onStep(0);
    if (this.opts.onReset) this.opts.onReset();
  };

  /* ---------- 坐标格式化：列用字母 A-O，行用数字 1-15 ---------- */
  GomokuGame.prototype._coord = function (row, col) {
    var colLetter = String.fromCharCode(65 + col); // A..O
    return colLetter + (row + 1);
  };

  /* ---------- Canvas 尺寸（适配高分屏） ---------- */
  GomokuGame.prototype._setupCanvas = function () {
    var px = this.pixel;
    this.canvas.width = px * this.dpr;
    this.canvas.height = px * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  /* ---------- 输入处理 ---------- */
  GomokuGame.prototype._bindInput = function () {
    var self = this;
    // 触摸后短时间内忽略随之而来的 click，避免同一次点触发两次落子
    var touchedAt = 0;

    var place = function (e) {
      if (self.over || self.current !== HUMAN) return;
      e.preventDefault();
      var point = self._eventToCell(e);
      if (point) self.playHuman(point.row, point.col);
    };

    // 触摸：用 touchstart 消除移动端 ~300ms 点击延迟
    this.canvas.addEventListener('touchstart', function (e) {
      touchedAt = Date.now();
      place(e);
    }, { passive: false });

    // 鼠标点击：若刚发生过触摸则跳过，防止 touch→click 重复触发
    this.canvas.addEventListener('click', function (e) {
      if (Date.now() - touchedAt < 500) return;
      place(e);
    });
  };

  // 将屏幕坐标换算成最近的交叉点
  GomokuGame.prototype._eventToCell = function (e) {
    var rect = this.canvas.getBoundingClientRect();
    var clientX, clientY;
    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    // 换算到内部像素坐标
    var scaleX = this.pixel / rect.width;
    var scaleY = this.pixel / rect.height;
    var x = (clientX - rect.left) * scaleX;
    var y = (clientY - rect.top) * scaleY;

    var col = Math.round((x - this.margin) / this.gap);
    var row = Math.round((y - this.margin) / this.gap);

    if (row < 0 || row >= this.size || col < 0 || col >= this.size) return null;
    if (this.board[row][col] !== EMPTY) return null;
    return { row: row, col: col };
  };

  /* ---------- 落子流程 ---------- */
  GomokuGame.prototype.playHuman = function (row, col) {
    if (this.over || this.board[row][col] !== EMPTY) return;
    this._place(row, col, HUMAN);
    this.steps++;
    if (this.opts.onStep) this.opts.onStep(this.steps);

    if (this._checkEnd(row, col, HUMAN)) return;

    // 地形吞噬：玩家落子后按节奏塌陷外圈，吞噬其上的棋子
    var collapsed = this._terrainTick();
    if (collapsed) {
      this.draw();
      if (this._checkTerrainDraw()) return;
    }

    // 轮到 AI
    this.current = AI;
    var think = collapsed
      ? '外圈塌陷为熔岩！电脑思考中…'
      : '电脑思考中…';
    this._status(think, 'thinking');
    var self = this;
    // 用 setTimeout 让界面先刷新“思考中”
    setTimeout(function () { self._aiTurn(); }, collapsed ? 500 : 220);
  };

  // 地形吞噬：活动战场内已无空位则判和
  GomokuGame.prototype._checkTerrainDraw = function () {
    if (this.mode !== 'terrain' || this.over) return false;
    for (var r = this.terrainMin; r <= this.terrainMax; r++) {
      for (var c = this.terrainMin; c <= this.terrainMax; c++) {
        if (this.board[r][c] === EMPTY) return false;
      }
    }
    this.over = true;
    this._status('战场被熔岩吞没，平局', '');
    if (this.opts.onGameOver) this.opts.onGameOver({ winner: 'draw', steps: this.steps });
    return true;
  };

  GomokuGame.prototype._aiTurn = function () {
    if (this.over) return;
    // Boss 模式：影子分身，一回合落两子
    if (this.mode === 'boss') { this._bossTurn(); return; }

    var self = this;
    // 计算交给调度层：hard 难度优先后台 Worker（不卡界面），否则主线程同步
    this._computeMove(this.board, this.size, this.difficulty, function (move) {
      // 计算是异步的，回调时局面可能已因复位/悔棋改变，需重新校验
      if (self.over || self.current !== AI) return;
      self._applyAIMove(move);
    });
  };

  // 应用 AI 计算出的一手（供同步与异步两条路径共用）
  GomokuGame.prototype._applyAIMove = function (move) {
    if (!move) { this.draw(); return; }
    // 目标点可能已非空（异步期间局面变动），放弃本次落子
    if (this.board[move.row][move.col] !== EMPTY) return;

    // 先播报 AI 的落子思路（方法论）
    if (this.opts.onAIReason) {
      this.opts.onAIReason({
        tactic: move.tactic || '思考',
        reason: move.reason || '',
        coord: this._coord(move.row, move.col)
      });
    }

    this._place(move.row, move.col, AI);

    if (this._checkEnd(move.row, move.col, AI)) return;
    if (this._checkTerrainDraw()) return;   // 活动区被填满则判和

    this.current = HUMAN;
    var tip = (this.mode === 'terrain' && this._terrainCanShrink())
      ? '你的回合（每 ' + SHRINK_EVERY + ' 手外圈塌陷，当心边缘）'
      : '你的回合，请落子';
    this._status(tip, '');
  };

  /* ============================================================
   * AI 计算调度：hard 难度的深度搜索交给 Web Worker 后台线程，
   * 避免主线程长时间占用导致界面卡顿。无法创建 Worker 时
   * （如 file:// 协议下部分浏览器禁用），自动退回主线程同步计算。
   *   callback(move)  计算完成后回传落子
   * ============================================================ */
  GomokuGame.prototype._computeMove = function (board, size, difficulty, callback) {
    var self = this;
    // 仅 hard 值得放后台（搜索最久）；easy/medium 计算极快，同步即可
    if (difficulty === 'hard') {
      var worker = this._ensureWorker();
      if (worker) {
        this._pendingMove = callback;      // 记住本次请求的回调
        // 危险区是主线程状态，需随消息带给 Worker（地形吞噬模式下 AI 才会规避外圈）
        worker.postMessage({
          board: board, size: size, difficulty: difficulty,
          danger: this._dangerCells()
        });
        return;
      }
    }
    // 兜底：主线程同步计算（原有行为）
    var move = GomokuAI.chooseMove(board, size, difficulty);
    callback(move);
  };

  // 当前危险圈转为格子数组（供 Worker 复现规避逻辑）；非地形模式为空
  GomokuGame.prototype._dangerCells = function () {
    var cells = [];
    if (this.mode !== 'terrain' || !this.dangerSet) return cells;
    for (var key in this.dangerSet) {
      if (!this.dangerSet.hasOwnProperty(key)) continue;
      var parts = key.split(',');
      cells.push({ row: parseInt(parts[0], 10), col: parseInt(parts[1], 10) });
    }
    return cells;
  };

  // 惰性创建并复用 AI Worker；创建失败返回 null（调用方走同步兜底）
  GomokuGame.prototype._ensureWorker = function () {
    if (this._worker !== undefined) return this._worker; // 已尝试过（含 null）
    try {
      var w = new global.Worker('js/ai-worker.js');
      var self = this;
      w.onmessage = function (e) {
        var cb = self._pendingMove;
        self._pendingMove = null;
        if (cb) cb(e.data && e.data.move);
      };
      w.onerror = function () {
        // 运行期出错：弃用 Worker，本次及以后都走同步兜底
        self._worker = null;
        var cb = self._pendingMove;
        self._pendingMove = null;
        if (cb) cb(GomokuAI.chooseMove(self.board, self.size, self.difficulty));
      };
      this._worker = w;
    } catch (err) {
      this._worker = null; // file:// 等环境无法创建，退回同步
    }
    return this._worker;
  };

  // Boss（影子分身）回合：每两回合才动用一次“双子天赋”，其余回合只落一子，
  // 给玩家留出铺设双活三的喘息空间；每子后独立判定胜负。
  GomokuGame.prototype._bossTurn = function () {
    this.bossTurnNo++;
    var isDouble = (this.bossTurnNo % 2 === 0); // 第 2、4、6… 回合落两子
    var count = isDouble ? 2 : 1;
    var stones = [];   // 收集本回合落子，供思路面板合并展示

    for (var n = 0; n < count; n++) {
      if (this.over) break;
      var move = GomokuAI.chooseBossMove(this.board, this.size);
      if (!move) break;

      stones.push({
        tactic: move.tactic || '思考',
        reason: move.reason || '',
        coord: this._coord(move.row, move.col)
      });

      this._place(move.row, move.col, AI);
      if (this._checkEnd(move.row, move.col, AI)) {
        this._reportBoss(stones);
        return;
      }
    }

    this._reportBoss(stones);
    this.current = HUMAN;
    var next = (this.bossTurnNo % 2 === 1)
      ? '你的回合，请落子（下一手电脑将祭出双子天赋，当心）'
      : '你的回合，请落子（本模式你四连即胜）';
    this._status(next, '');
  };

  // 合并播报 Boss 本回合的两手思路
  GomokuGame.prototype._reportBoss = function (stones) {
    if (!this.opts.onAIReason || stones.length === 0) return;
    if (stones.length === 1) {
      this.opts.onAIReason(stones[0]);
      return;
    }
    var coords = stones[0].coord + ' + ' + stones[1].coord;
    this.opts.onAIReason({
      tactic: '双子',
      reason: '影子分身落两子（' + coords + '）：①' + stones[0].reason +
        '；②' + stones[1].reason,
      coord: coords
    });
  };

  GomokuGame.prototype._place = function (row, col, player) {
    this.board[row][col] = player;
    this.history.push({ row: row, col: col, player: player });
    this.lastMove = { row: row, col: col };
    this._animStone(row, col);   // 启动这枚子的弹入动画（内部会驱动重绘）
    Sound.play(player === HUMAN ? 'placeHuman' : 'placeAI');

    // 落子记录回调
    if (this.opts.onMove) {
      this.opts.onMove({
        player: player === HUMAN ? 'human' : 'ai',
        row: row,
        col: col,
        coord: this._coord(row, col),
        index: this.history.length
      });
    }
  };

  // 检查是否结束；结束返回 true
  GomokuGame.prototype._checkEnd = function (row, col, player) {
    var target = this._winTarget(player);
    if (GomokuAI.hasLine(this.board, this.size, row, col, player, target)) {
      this.over = true;
      this.winLine = this._findWinLine(row, col, player);
      this._finalWinLine = this.winLine;   // 记住终局连线，供复盘最后一帧高亮
      this.draw();
      if (player === HUMAN) {
        this._status('你赢了！🎉', 'win');
        Sound.play('win');
      } else {
        this._status('电脑获胜，再接再厉', 'lose');
        Sound.play('lose');
      }
      if (this.opts.onGameOver) {
        this.opts.onGameOver({
          winner: player === HUMAN ? 'human' : 'ai',
          steps: this.steps
        });
      }
      return true;
    }
    // 平局：棋盘满
    if (this.history.length >= this.size * this.size) {
      this.over = true;
      this._status('平局', '');
      if (this.opts.onGameOver) {
        this.opts.onGameOver({ winner: 'draw', steps: this.steps });
      }
      return true;
    }
    return false;
  };

  // 找出获胜连线坐标（用于高亮）；target 为该方取胜所需连子数
  GomokuGame.prototype._findWinLine = function (row, col, player) {
    var target = this._winTarget(player);
    var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (var d = 0; d < dirs.length; d++) {
      var dr = dirs[d][0], dc = dirs[d][1];
      var cells = [{ row: row, col: col }];
      var i;
      for (i = 1; i < target; i++) {
        var nr = row + dr * i, nc = col + dc * i;
        if (this._cellIs(nr, nc, player)) cells.push({ row: nr, col: nc });
        else break;
      }
      for (i = 1; i < target; i++) {
        var pr = row - dr * i, pc = col - dc * i;
        if (this._cellIs(pr, pc, player)) cells.unshift({ row: pr, col: pc });
        else break;
      }
      if (cells.length >= target) return cells;
    }
    return null;
  };

  GomokuGame.prototype._cellIs = function (r, c, player) {
    return r >= 0 && r < this.size && c >= 0 && c < this.size &&
      this.board[r][c] === player;
  };

  /* ---------- 悔棋：撤销一轮（玩家 + AI） ---------- */
  GomokuGame.prototype.undo = function () {
    if (this.over || this.current !== HUMAN) return false;
    if (this.history.length === 0) return false;
    // 地形吞噬：塌陷不可逆，悔棋会与地形状态错位，故本模式禁用
    if (this.mode === 'terrain') return false;

    // 撤销直到移除掉玩家最近的一手
    var removedHuman = false;
    while (this.history.length > 0 && !removedHuman) {
      var last = this.history.pop();
      this.board[last.row][last.col] = EMPTY;
      if (last.player === HUMAN) {
        removedHuman = true;
        this.steps = Math.max(0, this.steps - 1);
      }
    }
    this.lastMove = this.history.length
      ? { row: this.history[this.history.length - 1].row,
          col: this.history[this.history.length - 1].col }
      : null;
    this.current = HUMAN;
    this._stopAnim();
    this.draw();
    this._status('已悔棋，请重新落子', '');
    if (this.opts.onStep) this.opts.onStep(this.steps);
    return true;
  };

  /* ---------- 导出当前落子记录（供悔棋后重建面板） ---------- */
  GomokuGame.prototype.getMoveLog = function () {
    var self = this;
    return this.history.map(function (h, i) {
      return {
        player: h.player === HUMAN ? 'human' : 'ai',
        row: h.row,
        col: h.col,
        coord: self._coord(h.row, h.col),
        index: i + 1
      };
    });
  };

  /* ---------- 状态回调封装 ---------- */
  GomokuGame.prototype._status = function (text, cls) {
    if (this.opts.onStatus) this.opts.onStatus(text, cls || '');
  };

  /* ---------- 绘制 ---------- */
  GomokuGame.prototype.draw = function () {
    var ctx = this.ctx;
    var px = this.pixel, m = this.margin, gap = this.gap;

    // 背景（木色由 CSS 给出，这里画格线）
    ctx.clearRect(0, 0, px, px);

    // 地形吞噬：先铺熔岩格与危险圈底色
    if (this.mode === 'terrain') this._drawTerrain();

    // 网格线
    ctx.strokeStyle = 'rgba(80,50,20,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < this.size; i++) {
      var pos = m + gap * i;
      // 横线
      ctx.moveTo(m, pos);
      ctx.lineTo(px - m, pos);
      // 竖线
      ctx.moveTo(pos, m);
      ctx.lineTo(pos, px - m);
    }
    ctx.stroke();

    // 星位（天元 + 四星）
    var stars = this._starPoints();
    ctx.fillStyle = 'rgba(60,38,15,0.9)';
    for (var s = 0; s < stars.length; s++) {
      var sx = m + gap * stars[s][1];
      var sy = m + gap * stars[s][0];
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 棋子（只画黑白子；熔岩格 BLOCKED 由 _drawTerrain 单独绘制）
    var anim = this._anim;
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        var v = this.board[r][c];
        if (v === HUMAN || v === AI) {
          // 正在弹入的那枚子按当前进度缩放，其余正常大小
          var scale = (anim && anim.row === r && anim.col === c) ? anim.scale : 1;
          this._drawStone(r, c, v, scale);
        }
      }
    }

    // 最近一手标记
    if (this.lastMove) {
      this._markLast(this.lastMove.row, this.lastMove.col);
    }

    // 获胜连线高亮
    if (this.winLine) {
      this._drawWinLine();
    }
  };

  GomokuGame.prototype._starPoints = function () {
    // 15 路棋盘标准星位（天元 + 四星）
    return [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]];
  };

  GomokuGame.prototype._drawStone = function (row, col, player, scale) {
    var ctx = this.ctx;
    var x = this.margin + this.gap * col;
    var y = this.margin + this.gap * row;
    var radius = this.gap * 0.42 * (scale == null ? 1 : scale);
    if (radius <= 0) return;

    var grad = ctx.createRadialGradient(
      x - radius * 0.35, y - radius * 0.35, radius * 0.15,
      x, y, radius
    );
    if (player === HUMAN) {
      grad.addColorStop(0, '#5a5a5a');
      grad.addColorStop(1, '#0a0a0a');
    } else {
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(1, '#c2c6d0');
    }
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 轻微描边
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  };

  GomokuGame.prototype._markLast = function (row, col) {
    var ctx = this.ctx;
    var x = this.margin + this.gap * col;
    var y = this.margin + this.gap * row;
    ctx.strokeStyle = '#f0a832';
    ctx.lineWidth = 2;
    var r = this.gap * 0.18;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  };

  /* ---------- 落子弹入动画 ----------
   * 缓动 easeOutBack：末尾轻微过冲再回落，模拟“落子”手感。
   * 仅对实时落子生效；回放重建走 _rebuildBoardTo，不触发动画，保证拖动进度条流畅。
   */
  function easeOutBack(t) {
    var s = 1.70158;
    t -= 1;
    return t * t * ((s + 1) * t + s) + 1;
  }

  GomokuGame.prototype._animStone = function (row, col) {
    this._stopAnim();
    var self = this;
    var start = now();
    this._anim = { row: row, col: col, scale: 0 };
    function step() {
      var p = (now() - start) / PLACE_ANIM;
      if (p >= 1) {
        self._anim = null;   // 动画结束，恢复静态渲染
        self.draw();
        self._animId = null;
        return;
      }
      self._anim.scale = easeOutBack(p);
      self.draw();
      self._animId = raf(step);
    }
    this._animId = raf(step);
  };

  GomokuGame.prototype._stopAnim = function () {
    if (this._animId) { caf(this._animId); this._animId = null; }
    this._anim = null;
  };

  GomokuGame.prototype._drawWinLine = function () {
    var ctx = this.ctx;
    var line = this.winLine;
    var first = line[0], last = line[line.length - 1];
    var x1 = this.margin + this.gap * first.col;
    var y1 = this.margin + this.gap * first.row;
    var x2 = this.margin + this.gap * last.col;
    var y2 = this.margin + this.gap * last.row;
    ctx.strokeStyle = 'rgba(240,80,80,0.9)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  /* ============================================================
   * 复盘回放：对局结束后逐手重演
   *   - replay.active   是否处于回放模式
   *   - replay.index    当前显示到第几手（0 = 空棋盘，n = 已落 n 手）
   *   - replay.playing  是否自动播放中
   * 通过 opts.onReplay(state) 把状态推给界面渲染控制条
   * ============================================================ */

  // 进入回放模式（仅在对局结束后可用）；从空盘开始
  GomokuGame.prototype.startReplay = function () {
    if (!this.over || this.history.length === 0) return false;
    this._stopAnim();          // 回放走静态重建，停掉可能未播完的落子动画
    this.replay.active = true;
    this.replay.playing = false;
    this.replay.index = 0;
    this._renderReplayFrame();
    this._emitReplay();
    return true;
  };

  // 退出回放，恢复到终局画面
  GomokuGame.prototype.exitReplay = function () {
    if (!this.replay.active) return;
    this._stopReplayTimer();
    this.replay.active = false;
    this.replay.playing = false;
    // 重建到最终局面
    this._rebuildBoardTo(this.history.length);
    this.winLine = this._finalWinLine || null;
    this.lastMove = this.history.length
      ? this.history[this.history.length - 1]
      : null;
    this.draw();
    this._emitReplay();
  };

  // 跳到第 idx 手（0..history.length）
  GomokuGame.prototype.replaySeek = function (idx) {
    if (!this.replay.active) return;
    var max = this.history.length;
    if (idx < 0) idx = 0;
    if (idx > max) idx = max;
    this.replay.index = idx;
    this._renderReplayFrame();
    this._emitReplay();
    // 播放到底自动停
    if (this.replay.playing && idx >= max) this.replayPause();
  };

  GomokuGame.prototype.replayNext = function () {
    this.replaySeek(this.replay.index + 1);
  };
  GomokuGame.prototype.replayPrev = function () {
    this.replayPause();
    this.replaySeek(this.replay.index - 1);
  };
  GomokuGame.prototype.replayFirst = function () {
    this.replayPause();
    this.replaySeek(0);
  };
  GomokuGame.prototype.replayLast = function () {
    this.replayPause();
    this.replaySeek(this.history.length);
  };

  // 自动播放：每 700ms 推进一手；到底后自动切到暂停
  GomokuGame.prototype.replayPlay = function () {
    if (!this.replay.active) return;
    if (this.replay.index >= this.history.length) this.replaySeek(0); // 已到底则从头
    this.replay.playing = true;
    var self = this;
    this._stopReplayTimer();
    this._replayTimer = setInterval(function () {
      self.replayNext();
    }, 700);
    this._emitReplay();
  };

  GomokuGame.prototype.replayPause = function () {
    this._stopReplayTimer();
    if (this.replay) this.replay.playing = false;
    this._emitReplay();
  };

  GomokuGame.prototype.replayToggle = function () {
    if (this.replay.playing) this.replayPause();
    else this.replayPlay();
  };

  GomokuGame.prototype._stopReplayTimer = function () {
    if (this._replayTimer) {
      clearInterval(this._replayTimer);
      this._replayTimer = null;
    }
  };

  // 按当前 replay.index 重建棋盘并绘制该帧
  GomokuGame.prototype._renderReplayFrame = function () {
    var idx = this.replay.index;
    this._rebuildBoardTo(idx);
    // 最后一帧显示获胜连线，其余帧不显示
    this.winLine = (idx >= this.history.length) ? (this._finalWinLine || null) : null;
    this.lastMove = idx > 0 ? this.history[idx - 1] : null;
    this.draw();
  };

  // 把棋盘重建到「前 n 手已落」的状态（不改动 history）
  GomokuGame.prototype._rebuildBoardTo = function (n) {
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) this.board[r][c] = EMPTY;
    }
    for (var i = 0; i < n && i < this.history.length; i++) {
      var h = this.history[i];
      this.board[h.row][h.col] = h.player;
    }
    // 地形吞噬：按时序重演塌陷。取「ply ≤ n 的最后一次塌陷」的活动范围，
    // 该范围外的格子在此帧均已化为熔岩（熔岩不可再落子，故先摆子再覆盖无误）。
    if (this.mode === 'terrain' && this.terrainEvents && this.terrainEvents.length) {
      var lo = 0, hi = this.size - 1, applied = false;
      for (var e = 0; e < this.terrainEvents.length; e++) {
        var ev = this.terrainEvents[e];
        if (ev.ply <= n) { lo = ev.min; hi = ev.max; applied = true; }
      }
      if (applied) {
        for (var rr = 0; rr < this.size; rr++) {
          for (var cc = 0; cc < this.size; cc++) {
            if (rr < lo || rr > hi || cc < lo || cc > hi) this.board[rr][cc] = BLOCKED;
          }
        }
      }
      // 回放帧用独立的危险圈提示，避免污染真实对局的 dangerSet
      this._replayDanger(lo, hi, applied);
    }
  };

  // 计算某回放帧的危险圈（仅用于绘制，不写入 AI）
  GomokuGame.prototype._replayDanger = function (lo, hi, applied) {
    this.dangerSet = {};
    // 若已收缩到核心区则不再有危险圈
    if ((hi - lo) <= MIN_SPAN) return;
    for (var r = lo; r <= hi; r++) {
      for (var c = lo; c <= hi; c++) {
        if (r === lo || r === hi || c === lo || c === hi) this.dangerSet[r + ',' + c] = true;
      }
    }
  };

  // 把回放状态推给界面
  GomokuGame.prototype._emitReplay = function () {
    if (!this.opts.onReplay) return;
    var rp = this.replay || { active: false, index: 0, playing: false };
    this.opts.onReplay({
      active: rp.active,
      index: rp.index,
      total: this.history.length,
      playing: rp.playing
    });
  };

  /* ---------- 地形吞噬：绘制熔岩格与危险圈 ---------- */
  GomokuGame.prototype._drawTerrain = function () {
    var ctx = this.ctx;
    var m = this.margin, gap = this.gap;
    var half = gap * 0.5;

    // 熔岩格（已塌陷）：整格填暗红，中心一点余烬
    ctx.save();
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        if (this.board[r][c] !== BLOCKED) continue;
        var x = m + gap * c, y = m + gap * r;
        var g = ctx.createRadialGradient(x, y, 1, x, y, half * 1.4);
        g.addColorStop(0, 'rgba(120,20,10,0.92)');
        g.addColorStop(1, 'rgba(50,8,6,0.92)');
        ctx.fillStyle = g;
        ctx.fillRect(x - half, y - half, gap, gap);
      }
    }
    ctx.restore();

    // 危险圈（下一次将塌陷的最外圈）：橙色警示描边
    if (this.dangerSet) {
      ctx.save();
      ctx.fillStyle = 'rgba(240,120,40,0.16)';
      for (var key in this.dangerSet) {
        if (!this.dangerSet.hasOwnProperty(key)) continue;
        var parts = key.split(',');
        var dr = parseInt(parts[0], 10), dc = parseInt(parts[1], 10);
        var dx = m + gap * dc, dy = m + gap * dr;
        ctx.fillRect(dx - half, dy - half, gap, gap);
      }
      ctx.restore();
    }
  };

  // 静音开关（供界面按钮调用）
  GomokuGame.prototype.setMuted = function (m) {
    Sound.setMuted(m);
  };
  GomokuGame.prototype.isMuted = function () {
    return Sound.isMuted();
  };

  global.GomokuGame = GomokuGame;
})(window);
