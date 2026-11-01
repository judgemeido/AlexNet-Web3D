/* ============================================================
 * ai.js —  五子棋 AI 引擎
 * 提供三档难度：easy / medium / hard
 * 全局暴露 GomokuAI.chooseMove(board, size, difficulty)
 * board: 二维数组，0 空、1 黑(玩家)、2 白(AI)
 * 返回 { row, col, reason, tactic }
 *   reason: 本手落子的思路说明（用于界面展示）
 *   tactic: 战术标签（开局/制胜/防守/进攻/推演）
 * ============================================================ */
(function (global) {
  'use strict';

  var EMPTY = 0;
  var HUMAN = 1;
  var AI = 2;
  var BLOCKED = 3;           // 地形吞噬：熔岩格（不可落子，对连子而言等同于墙）

  /* ---------- 棋型评分表 ---------- */
  // 用于对某一方向连子进行打分
  var SCORE = {
    FIVE: 1000000,      // 连五
    OPEN_FOUR: 100000,  // 活四
    FOUR: 10000,        // 冲四（含被堵一端）
    OPEN_THREE: 8000,   // 活三
    THREE: 1000,        // 眠三
    OPEN_TWO: 800,      // 活二
    TWO: 100,           // 眠二
    ONE: 10
  };

  /* ---------- 工具函数 ---------- */
  function inBounds(r, c, size) {
    return r >= 0 && r < size && c >= 0 && c < size;
  }

  function cloneBoard(board) {
    return board.map(function (row) { return row.slice(); });
  }

  function isEmptyBoard(board, size) {
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        if (board[r][c] !== EMPTY) return false;
      }
    }
    return true;
  }

  // 找出所有已有棋子附近的空点（缩小搜索范围）
  function candidateMoves(board, size, radius) {
    radius = radius || 2;
    var seen = {};
    var moves = [];
    var hasStone = false;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        // 只围绕真实棋子扩展；空格与熔岩格不作为扩展中心
        if (board[r][c] !== HUMAN && board[r][c] !== AI) continue;
        hasStone = true;
        for (var dr = -radius; dr <= radius; dr++) {
          for (var dc = -radius; dc <= radius; dc++) {
            var nr = r + dr, nc = c + dc;
            if (!inBounds(nr, nc, size)) continue;
            if (board[nr][nc] !== EMPTY) continue;
            var key = nr + ',' + nc;
            if (seen[key]) continue;
            seen[key] = true;
            moves.push({ row: nr, col: nc });
          }
        }
      }
    }
    // 空棋盘时下中心
    if (!hasStone) {
      var mid = Math.floor(size / 2);
      return [{ row: mid, col: mid }];
    }
    return moves;
  }

  var DIRS = [
    [0, 1],   // 横
    [1, 0],   // 竖
    [1, 1],   // 斜 \
    [1, -1]   // 斜 /
  ];

  /* ---------- 单点在某一方向的连子分析 ---------- */
  // 假设 player 落在 (r,c) 后，评估该点对 player 的价值
  function evaluatePoint(board, size, r, c, player) {
    var total = 0;
    for (var d = 0; d < DIRS.length; d++) {
      total += evaluateDirection(board, size, r, c, DIRS[d][0], DIRS[d][1], player);
    }
    return total;
  }

  // 某方向上的连子信息：{ count 连续同色含自身, block 被堵端数 }
  function lineInfo(board, size, r, c, dr, dc, player) {
    var count = 1;
    var block = 0;
    var i;
    // 正方向
    for (i = 1; i <= 4; i++) {
      var nr = r + dr * i, nc = c + dc * i;
      if (!inBounds(nr, nc, size)) { block++; break; }
      var v = board[nr][nc];
      if (v === player) { count++; }
      else if (v === EMPTY) { break; }
      else { block++; break; }
    }
    // 反方向
    for (i = 1; i <= 4; i++) {
      var nr2 = r - dr * i, nc2 = c - dc * i;
      if (!inBounds(nr2, nc2, size)) { block++; break; }
      var v2 = board[nr2][nc2];
      if (v2 === player) { count++; }
      else if (v2 === EMPTY) { break; }
      else { block++; break; }
    }
    return { count: count, block: block };
  }

  function evaluateDirection(board, size, r, c, dr, dc, player) {
    var info = lineInfo(board, size, r, c, dr, dc, player);
    return lineScore(info.count, info.block);
  }

  function lineScore(count, block) {
    if (count >= 5) return SCORE.FIVE;
    if (block === 2 && count < 5) return 0; // 两端全堵且不足五，无效

    switch (count) {
      case 4:
        return block === 0 ? SCORE.OPEN_FOUR : SCORE.FOUR;
      case 3:
        return block === 0 ? SCORE.OPEN_THREE : SCORE.THREE;
      case 2:
        return block === 0 ? SCORE.OPEN_TWO : SCORE.TWO;
      case 1:
        return SCORE.ONE;
      default:
        return 0;
    }
  }

  // 棋型中文名（用于思路说明）
  function shapeName(count, block) {
    if (count >= 5) return '连五';
    if (block === 2 && count < 5) return null;
    switch (count) {
      case 4: return block === 0 ? '活四' : '冲四';
      case 3: return block === 0 ? '活三' : '眠三';
      case 2: return block === 0 ? '活二' : '眠二';
      case 1: return '单子';
      default: return null;
    }
  }

  // 在 (r,c) 落子后，统计 player 在四个方向形成的棋型
  //   best   最强单向棋型 { name, score }
  //   counts 各棋型出现次数（用于识别双活三/四三等组合杀）
  function shapeStats(board, size, r, c, player) {
    var best = { name: null, score: -1 };
    var counts = {};
    board[r][c] = player;
    for (var d = 0; d < DIRS.length; d++) {
      var info = lineInfo(board, size, r, c, DIRS[d][0], DIRS[d][1], player);
      var s = lineScore(info.count, info.block);
      var name = shapeName(info.count, info.block);
      if (name) counts[name] = (counts[name] || 0) + 1;
      if (s > best.score) { best.score = s; best.name = name; }
    }
    board[r][c] = EMPTY;
    return { best: best, counts: counts };
  }

  // 兼容旧调用：只取最强单向棋型
  function bestShape(board, size, r, c, player) {
    return shapeStats(board, size, r, c, player).best;
  }

  // 根据棋型计数识别组合棋型（组合杀优先）
  function comboName(counts) {
    var c4 = counts['冲四'] || 0;
    var c3 = counts['活三'] || 0;
    var c2 = counts['活二'] || 0;
    if (counts['连五']) return '连五';
    if (counts['活四']) return '活四';
    if (c4 >= 2) return '双冲四';
    if (c4 >= 1 && c3 >= 1) return '四三';
    if (c3 >= 2) return '双活三';
    if (c4) return '冲四';
    if (c3) return '活三';
    if (counts['眠三']) return '眠三';
    if (c2 >= 2) return '双活二';
    if (c2) return '活二';
    if (counts['眠二']) return '眠二';
    return '单子';
  }

  // 棋型威胁等级（越大越强），用于比较攻守主次
  var COMBO_ORDER = ['单子', '眠二', '活二', '双活二', '眠三', '活三',
    '双活三', '冲四', '四三', '双冲四', '活四', '连五'];
  function comboRank(name) {
    var i = COMBO_ORDER.indexOf(name);
    return i < 0 ? 0 : i;
  }
  // 双活三及以上属于难以两头兼顾的“杀棋”
  function isKiller(name) {
    return comboRank(name) >= comboRank('双活三');
  }

  // 组合棋型的通俗解读
  function comboDesc(name) {
    switch (name) {
      case '连五': return '直接连成五子';
      case '活四': return '两端皆可成五的活四，无解';
      case '双冲四': return '两路冲四，你只能堵一头';
      case '四三': return '冲四与活三的双重威胁，难以兼顾';
      case '双活三': return '两个活三同时成形，你无法两头兼顾';
      case '冲四': return '冲四逼你应手';
      case '活三': return '活三，下一手即可成活四';
      case '眠三': return '眠三，稳步推进';
      case '双活二': return '两个活二，铺开阵型';
      case '活二': return '活二，蓄势待发';
      default: return null;
    }
  }

  // 综合分析某个落点：识别攻守主次与组合棋型，给出说明
  function analyzeMove(board, size, r, c) {
    var atk = shapeStats(board, size, r, c, AI);
    var def = shapeStats(board, size, r, c, HUMAN);
    var atkCombo = comboName(atk.counts);
    var defCombo = comboName(def.counts);
    var atkRank = comboRank(atkCombo);
    var defRank = comboRank(defCombo);

    var tactic, reason;
    // 进攻组合达到杀棋级别，且不弱于对方威胁 → 果断抢攻
    if (isKiller(atkCombo) && atkRank >= defRank) {
      tactic = '进攻';
      reason = '抢攻制胜：此手形成' + atkCombo + '，' +
        (comboDesc(atkCombo) || '构成多重威胁') + '，主动掌握杀势';
    } else if (defRank > atkRank) {
      tactic = '防守';
      reason = '防守要点：你在此可下出' + defCombo + '，' +
        (comboDesc(defCombo) || '威胁较大') + '，抢占此点将其瓦解';
    } else {
      tactic = '进攻';
      reason = '稳步进攻：此点可为我方形成' + atkCombo +
        '，扩大阵地并兼顾防守';
    }
    return {
      tactic: tactic, reason: reason,
      attack: atkCombo, defend: defCombo
    };
  }

  /* ---------- 地形吞噬：危险区（即将被熔岩吞噬的格子） ----------
   * 由 game.js 在“地形吞噬”模式下调用 setDangerZone 设置，
   * AI 会大幅压低这些格子的价值——落在此处的子很快会连同棋形一起消失。
   */
  var dangerZone = null; // { "r,c": true } 或 null
  function setDangerZone(cells) {
    if (!cells || !cells.length) { dangerZone = null; return; }
    dangerZone = {};
    for (var i = 0; i < cells.length; i++) {
      dangerZone[cells[i].row + ',' + cells[i].col] = true;
    }
  }
  function inDanger(r, c) {
    return !!(dangerZone && dangerZone[r + ',' + c]);
  }

  /* ---------- 整体局面打分（用于某一点的综合价值） ---------- */
  // 对候选点：AI 进攻分 + 防守分（阻止玩家）
  function scoreMove(board, size, r, c) {
    // AI 在此落子的进攻价值
    var attack = evaluatePoint(board, size, r, c, AI);
    // 玩家在此落子的价值（AI 抢占即防守）
    var defend = evaluatePoint(board, size, r, c, HUMAN);
    // 略微偏重防守，避免只顾进攻被反杀
    var s = attack * 1.0 + defend * 0.9;
    // 危险区：落子价值大幅缩水（子会被吞噬）
    if (inDanger(r, c)) s *= 0.15;
    return s;
  }

  /* ---------- 胜负检测 ---------- */
  function isWin(board, size, r, c, player) {
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var count = 1;
      var i;
      for (i = 1; i <= 4; i++) {
        var nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc, size) || board[nr][nc] !== player) break;
        count++;
      }
      for (i = 1; i <= 4; i++) {
        var nr2 = r - dr * i, nc2 = c - dc * i;
        if (!inBounds(nr2, nc2, size) || board[nr2][nc2] !== player) break;
        count++;
      }
      if (count >= 5) return true;
    }
    return false;
  }

  /* ---------- 难度：EASY ---------- */
  // 大部分随机，偶尔看一步防守/进攻
  function moveEasy(board, size) {
    var moves = candidateMoves(board, size, 1);

    // 30% 概率做最基础的“成五/堵五”检查，其余随机
    if (Math.random() < 0.3) {
      var must = findWinningOrBlocking(board, size);
      if (must) return must;
    }
    var m = moves[Math.floor(Math.random() * moves.length)];
    return {
      row: m.row, col: m.col,
      tactic: '试探',
      reason: '简单模式：在你的棋子附近就近落子，随机应对'
    };
  }

  /* ---------- 难度：MEDIUM ---------- */
  // 贪心：先找必胜/必堵，否则取综合评分最高点
  function moveMedium(board, size) {
    var must = findWinningOrBlocking(board, size);
    if (must) return must;

    var moves = candidateMoves(board, size, 2);
    var best = null, bestScore = -1;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var s = scoreMove(board, size, m.row, m.col);
      // 加入少量随机避免每局雷同
      s += Math.random() * 50;
      if (s > bestScore) { bestScore = s; best = m; }
    }
    best = best || moves[0];
    var info = analyzeMove(board, size, best.row, best.col);
    return {
      row: best.row, col: best.col,
      tactic: info.tactic,
      reason: '贪心评估：' + info.reason
    };
  }

  /* ---------- 难度：HARD ----------
   * Minimax + Alpha-Beta 剪枝，配合迭代加深与威胁延伸：
   *   - 主搜索深度 6 步（原 4 步），叶节点用组合威胁评估
   *   - 逼着（冲四/活四等）延伸不消耗深度，把杀路算到底
   *   - 动态宽度：浅层看得宽、深层收得窄，控制耗时
   *   - 迭代加深 + 软时限，超时用上一层完整结果兜底，界面不卡
   */
  var HARD_DEPTH = 6;      // 目标搜索深度
  var TIME_BUDGET = 900;   // 软时限（毫秒），超时提前收敛

  function moveHard(board, size) {
    var must = findWinningOrBlocking(board, size);
    if (must) return must;

    var deadline = now() + TIME_BUDGET;

    // 算杀（VCF）：优先搜索本方的连续冲四强制胜。命中即锁定杀路第一手，
    // 这是“往后深算十几步”的核心——沿逼着线可推演 20+ 手。
    var kill = vcf(board, size, AI, HUMAN, VCF_DEPTH, now() + VCF_BUDGET);
    if (kill && kill.length) {
      var k = kill[0];
      return {
        row: k.row, col: k.col,
        tactic: '算杀',
        reason: '算杀锁定：已算出一条连续冲四的强制取胜路线（约 ' +
          (kill.length * 2) + ' 手），沿此逼着推进，你无法解除'
      };
    }

    // 防守算杀：若对手存在 VCF 强制胜，抢先占据能瓦解其全部杀路的关键点。
    var oppKill = vcf(board, size, HUMAN, AI, VCF_DEPTH, now() + VCF_BUDGET);
    if (oppKill && oppKill.length) {
      var def = findVCFDefense(board, size, now() + VCF_BUDGET);
      if (def) {
        return {
          row: def.row, col: def.col,
          tactic: '防守',
          reason: '拆解杀路：你手握一条连续冲四的强制胜线，此点是唯一能瓦解' +
            '整条杀路的要害，必须抢占'
        };
      }
    }

    var best = null;
    // 迭代加深：从浅到深逐层搜索，超时则采用已完成的最深一层
    for (var d = 2; d <= HARD_DEPTH; d++) {
      var r = minimax(board, size, d, -Infinity, Infinity, true, null, deadline);
      if (r.timedOut) break;          // 该层未算完，丢弃、保留上一层
      if (r.move) best = { move: r.move, depth: d, score: r.score };
      if (r.score >= SCORE.FIVE) break; // 已算到必胜，无需再深
    }

    if (best && best.move) {
      var m = best.move;
      var info = analyzeMove(board, size, m.row, m.col);
      return {
        row: m.row, col: m.col,
        tactic: '推演',
        reason: '深度推演：Minimax 向前搜索 ' + best.depth + ' 步、并沿逼着算到底，' + info.reason
      };
    }
    // 兜底
    return moveMedium(board, size);
  }

  function now() {
    return (global.performance && global.performance.now)
      ? global.performance.now() : Date.now();
  }

  function minimax(board, size, depth, alpha, beta, maximizing, lastMove, deadline) {
    // 终止：检测上一手是否分出胜负
    if (lastMove) {
      var lp = maximizing ? HUMAN : AI; // 上一手是对方
      if (isWin(board, size, lastMove.row, lastMove.col, lp)) {
        var termScore = (lp === AI ? SCORE.FIVE : -SCORE.FIVE);
        return { score: termScore + depth, move: null }; // +depth 偏好更快取胜
      }
    }
    if (depth <= 0) {
      // 到达深度上限：若存在逼着（冲四类）则继续延伸，把强制序列算清
      return { score: quiescence(board, size, alpha, beta, maximizing, deadline), move: null };
    }
    if (now() > deadline) {
      // 超时：返回静态评估并标记，让上层丢弃本次不完整结果
      return { score: evaluateBoard(board, size), move: null, timedOut: true };
    }

    var moves = orderedCandidates(board, size, maximizing ? AI : HUMAN);
    if (moves.length === 0) {
      return { score: evaluateBoard(board, size), move: null };
    }
    // 动态宽度：越靠近根节点看得越宽，越深越窄
    var width = depth >= 5 ? 12 : (depth >= 3 ? 9 : 6);
    if (moves.length > width) moves = moves.slice(0, width);

    var bestMove = null;
    if (maximizing) {
      var maxEval = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        board[m.row][m.col] = AI;
        var res = minimax(board, size, depth - 1, alpha, beta, false, m, deadline);
        board[m.row][m.col] = EMPTY;
        if (res.timedOut) return { score: maxEval, move: bestMove, timedOut: true };
        if (res.score > maxEval) { maxEval = res.score; bestMove = m; }
        alpha = Math.max(alpha, res.score);
        if (beta <= alpha) break;
      }
      return { score: maxEval, move: bestMove };
    } else {
      var minEval = Infinity;
      for (var j = 0; j < moves.length; j++) {
        var m2 = moves[j];
        board[m2.row][m2.col] = HUMAN;
        var res2 = minimax(board, size, depth - 1, alpha, beta, true, m2, deadline);
        board[m2.row][m2.col] = EMPTY;
        if (res2.timedOut) return { score: minEval, move: bestMove, timedOut: true };
        if (res2.score < minEval) { minEval = res2.score; bestMove = m2; }
        beta = Math.min(beta, res2.score);
        if (beta <= alpha) break;
      }
      return { score: minEval, move: bestMove };
    }
  }

  /* ---------- 威胁延伸（静态搜索）----------
   * 只在“存在逼着”时继续展开：一方走出冲四/活四会强制对方应手，
   * 这类强制序列不消耗主深度，避免出现算到一半的“水平线效应”误判。
   * 无逼着时直接返回静态评估。
   */
  function quiescence(board, size, alpha, beta, maximizing, deadline) {
    var standPat = evaluateBoard(board, size);
    // 无逼着的静态局面，直接以评估分收敛
    if (now() > deadline) return standPat;

    var player = maximizing ? AI : HUMAN;
    var forcing = forcingMoves(board, size, player);
    if (forcing.length === 0) return standPat;

    // stand-pat 作为下界/上界，不强迫走逼着
    if (maximizing) {
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
    } else {
      if (standPat <= alpha) return alpha;
      if (standPat < beta) beta = standPat;
    }

    var limit = Math.min(forcing.length, 6);
    for (var i = 0; i < limit; i++) {
      var m = forcing[i];
      board[m.row][m.col] = player;
      var win = isWin(board, size, m.row, m.col, player);
      var val = win
        ? (player === AI ? SCORE.FIVE : -SCORE.FIVE)
        : quiescence(board, size, alpha, beta, !maximizing, deadline);
      board[m.row][m.col] = EMPTY;
      if (maximizing) {
        if (val > alpha) alpha = val;
        if (alpha >= beta) return beta;
      } else {
        if (val < beta) beta = val;
        if (beta <= alpha) return alpha;
      }
    }
    return maximizing ? alpha : beta;
  }

  // 逼着候选：落子后能形成冲四及以上（含活四/连五）的点——迫使对方应手
  function forcingMoves(board, size, player) {
    var moves = candidateMoves(board, size, 1);
    var res = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var stat = shapeStats(board, size, m.row, m.col, player);
      if (stat.best.score >= SCORE.FOUR) {  // 冲四/活四/连五
        m._s = stat.best.score;
        res.push(m);
      }
    }
    res.sort(function (a, b) { return b._s - a._s; });
    return res;
  }

  // 按“落子后综合价值”排序候选，供剪枝优先展开
  function orderedCandidates(board, size, player) {
    var moves = candidateMoves(board, size, 2);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      m._s = scoreMove(board, size, m.row, m.col);
    }
    moves.sort(function (a, b) { return b._s - a._s; });
    return moves;
  }

  // 全局静态评估：AI 分 - 玩家分
  //   - 连子棋型分为主
  //   - 叠加轻量位置分：越靠中心越灵活（分数接近时的取舍偏好）
  //   - 略微加重对手权重（1.1），宁可稳守也不冒进被反杀
  function evaluateBoard(board, size) {
    var aiScore = 0, humanScore = 0;
    var mid = (size - 1) / 2;
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var v = board[r][c];
        if (v === EMPTY) continue;
        // 位置分：中心 = size，边角趋近 0
        var pos = size - (Math.abs(r - mid) + Math.abs(c - mid));
        if (v === AI) aiScore += pointStatic(board, size, r, c, AI) + pos;
        else if (v === HUMAN) humanScore += pointStatic(board, size, r, c, HUMAN) + pos;
      }
    }
    return aiScore - humanScore * 1.1;
  }

  // 对已有棋子做方向连子静态评分（避免重复计双方向，只向正方向数）
  function pointStatic(board, size, r, c, player) {
    var total = 0;
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      // 仅当反方向不是同色时才作为一条线的起点，避免重复
      var pr = r - dr, pc = c - dc;
      if (inBounds(pr, pc, size) && board[pr][pc] === player) continue;

      var count = 0;
      var i = 0;
      while (true) {
        var nr = r + dr * i, nc = c + dc * i;
        if (inBounds(nr, nc, size) && board[nr][nc] === player) { count++; i++; }
        else break;
      }
      // 两端是否被堵
      var block = 0;
      var beforeR = r - dr, beforeC = c - dc;
      var afterR = r + dr * count, afterC = c + dc * count;
      if (!inBounds(beforeR, beforeC, size) || board[beforeR][beforeC] !== EMPTY) block++;
      if (!inBounds(afterR, afterC, size) || board[afterR][afterC] !== EMPTY) block++;
      total += lineScore(count, block);
    }
    return total;
  }

  /* ---------- 通用：找必胜点或必堵点 ----------
   * 分层筛查（威胁由高到低）：
   *   1. AI 直接连五 → 制胜
   *   2. 玩家下一手连五 → 必堵
   *   3. AI 可下出杀棋（活四/双冲四/四三/双活三）→ 抢攻
   *   4. 玩家可下出杀棋 → 提前拆解
   * 命中即返回，reason 与真实棋型一致。
   */
  function findWinningOrBlocking(board, size) {
    var moves = candidateMoves(board, size, 2);
    var i, m;

    // 1. AI 能直接连五 → 立刻取胜
    for (i = 0; i < moves.length; i++) {
      m = moves[i];
      board[m.row][m.col] = AI;
      var aiWin = isWin(board, size, m.row, m.col, AI);
      board[m.row][m.col] = EMPTY;
      if (aiWin) {
        return {
          row: m.row, col: m.col,
          tactic: '制胜',
          reason: '我方已有四子相连，落此子即可连成五子，直接取胜'
        };
      }
    }

    // 2. 玩家下一手能连五 → 必须堵
    for (i = 0; i < moves.length; i++) {
      m = moves[i];
      board[m.row][m.col] = HUMAN;
      var humanWin = isWin(board, size, m.row, m.col, HUMAN);
      board[m.row][m.col] = EMPTY;
      if (humanWin) {
        return {
          row: m.row, col: m.col,
          tactic: '防守',
          reason: '你即将连成五子，这是致命威胁，必须在此封堵'
        };
      }
    }

    // 3. AI 能形成杀棋（活四及以上组合）→ 主动抢攻
    var atkKill = bestKillerMove(board, size, moves, AI);
    if (atkKill) {
      return {
        row: atkKill.row, col: atkKill.col,
        tactic: '进攻',
        reason: '抢攻制胜：此手形成' + atkKill.combo + '，' +
          (comboDesc(atkKill.combo) || '构成多重威胁') + '，你难以两头兼顾'
      };
    }

    // 4. 玩家能形成杀棋 → 提前拆解其关键点
    var defKill = bestKillerMove(board, size, moves, HUMAN);
    if (defKill) {
      return {
        row: defKill.row, col: defKill.col,
        tactic: '防守',
        reason: '预防杀棋：你在此可下出' + defKill.combo + '，' +
          (comboDesc(defKill.combo) || '威胁极大') + '，须提前占据要点拆解'
      };
    }

    return null;
  }

  // 在候选点中找出 player 能形成的最强杀棋（活四/双冲四/四三/双活三及以上）
  // 返回 { row, col, combo } 或 null
  function bestKillerMove(board, size, moves, player) {
    var best = null, bestRank = comboRank('双活三') - 1; // 门槛：至少双活三级别
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var combo = comboName(shapeStats(board, size, m.row, m.col, player).counts);
      var rank = comboRank(combo);
      if (rank > bestRank) {
        bestRank = rank;
        best = { row: m.row, col: m.col, combo: combo };
      }
    }
    return best;
  }

  /* ================= VCF 算杀搜索（连续冲四取胜） =================
   * 大师级深算的核心：只沿“逼着”（冲四/活四）展开。
   * 每一步冲四都强制对方唯一应手（堵住成五点），分支极窄，
   * 因此能沿强制线向后推演 20+ 手而几乎不耗时——这正是
   * 高手“往后算十几步”的真实方式（威胁空间搜索）。
   *
   * VCF_DEPTH：允许的连续冲四步数（每步含攻防两手），
   *   12 步冲四 ≈ 向后推演 23 手。
   */
  var VCF_DEPTH = 12;      // 连续冲四步数上限（约推演 24 手）
  var VCF_BUDGET = 350;    // 单次算杀软时限（毫秒），攻防各一次

  // 找出 player 落子即可连五的所有空点（四的“成五点”）
  function allFivePoints(board, size, player) {
    var moves = candidateMoves(board, size, 1);
    var pts = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      board[m.row][m.col] = player;
      var w = isWin(board, size, m.row, m.col, player);
      board[m.row][m.col] = EMPTY;
      if (w) pts.push(m);
    }
    return pts;
  }

  // 找出 player 落子后能形成冲四及以上（逼着）的候选点
  function fourMoves(board, size, player) {
    var moves = candidateMoves(board, size, 1);
    var res = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      var stat = shapeStats(board, size, m.row, m.col, player);
      if (stat.best.score >= SCORE.FOUR) {   // 冲四/活四/连五
        m._s = stat.best.score;
        res.push(m);
      }
    }
    res.sort(function (a, b) { return b._s - a._s; });
    return res;
  }

  // VCF 主体：attacker 走子，只用逼着；返回制胜着法序列或 null。
  // 深度以“连续冲四步数”计（depth 次），实际推演手数约为 depth*2。
  function vcf(board, size, attacker, defender, depth, deadline) {
    if (depth <= 0 || now() > deadline) return null;

    var fours = fourMoves(board, size, attacker);
    for (var i = 0; i < fours.length; i++) {
      var m = fours[i];
      board[m.row][m.col] = attacker;

      // 落子即连五 → 直接取胜
      if (isWin(board, size, m.row, m.col, attacker)) {
        board[m.row][m.col] = EMPTY;
        return [m];
      }

      var fivePts = allFivePoints(board, size, attacker); // 本手四的成五点
      if (fivePts.length === 0) { board[m.row][m.col] = EMPTY; continue; }

      // 若对方此刻能直接连五，则该攻击线失败（对方先胜）
      if (allFivePoints(board, size, defender).length > 0) {
        board[m.row][m.col] = EMPTY; continue;
      }

      if (fivePts.length >= 2) {
        // 活四 / 双冲四：对方堵不完，强制取胜
        board[m.row][m.col] = EMPTY;
        return [m];
      }

      // 单一成五点 → 对方被迫封堵该点
      var blk = fivePts[0];
      board[blk.row][blk.col] = defender;
      var seq = vcf(board, size, attacker, defender, depth - 1, deadline);
      board[blk.row][blk.col] = EMPTY;
      board[m.row][m.col] = EMPTY;
      if (seq) return [m].concat(seq);
    }
    return null;
  }

  // 防守算杀：当对手存在 VCF 强制胜时，逐一试探本方落点，
  // 找出能破坏对手全部连续冲四路线的关键点。
  function findVCFDefense(board, size, deadline) {
    var moves = orderedCandidates(board, size, AI);
    var limit = Math.min(moves.length, 16);
    for (var i = 0; i < limit; i++) {
      var m = moves[i];
      board[m.row][m.col] = AI;
      // 本方封堵/抢攻后，对手是否仍有 VCF？
      var stillWin = vcf(board, size, HUMAN, AI, VCF_DEPTH, deadline);
      board[m.row][m.col] = EMPTY;
      if (!stillWin) return m; // 该点瓦解了对手的强制胜
    }
    return null;
  }

  /* ================= 影子分身 Boss 玩法 =================
   * 不平等对局：电脑拥有“双子天赋”，每回合落两子（本函数被连调两次）；
   * 作为平衡，玩家只需四连即胜，电脑须五连才胜。
   * 因此电脑的防守目标是「阻止玩家凑成四连」（把玩家的三连视作致命威胁），
   * 而进攻目标仍是自身五连。电脑全力出击、不留破绽。
   */

  // 通用连子评分：按「距目标还差几子」映射棋型强度（target=5 时即为常规评分）
  function lineScoreN(count, block, target) {
    if (count >= target) return SCORE.FIVE;
    if (block === 2) return 0;          // 两端皆堵，无法达成
    var gap = target - count;           // 还差几子成线
    switch (gap) {
      case 1: return block === 0 ? SCORE.OPEN_FOUR : SCORE.FOUR;   // 差一子：活四/冲四级
      case 2: return block === 0 ? SCORE.OPEN_THREE : SCORE.THREE; // 差两子：活三/眠三级
      case 3: return block === 0 ? SCORE.OPEN_TWO : SCORE.TWO;
      default: return SCORE.ONE;
    }
  }

  // 以指定目标长度评估某点对 player 的价值
  function evaluatePointN(board, size, r, c, player, target) {
    var total = 0;
    for (var d = 0; d < DIRS.length; d++) {
      var info = lineInfo(board, size, r, c, DIRS[d][0], DIRS[d][1], player);
      total += lineScoreN(info.count, info.block, target);
    }
    return total;
  }

  // player 落子后能凑成 target 连的所有空点（即「制胜点」）
  function winPointsN(board, size, player, target) {
    var moves = candidateMoves(board, size, 1);
    var pts = [];
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      board[m.row][m.col] = player;
      var reach = false;
      for (var d = 0; d < DIRS.length; d++) {
        var info = lineInfo(board, size, m.row, m.col, DIRS[d][0], DIRS[d][1], player);
        if (info.count >= target) { reach = true; break; }
      }
      board[m.row][m.col] = EMPTY;
      if (reach) pts.push(m);
    }
    return pts;
  }

  // Boss 综合评分：自身进攻（目标 5）+ 遏制玩家（目标 4，偏重防守）
  function bossScore(board, size, r, c) {
    var atk = evaluatePointN(board, size, r, c, AI, 5);
    var def = evaluatePointN(board, size, r, c, HUMAN, 4);
    return atk * 1.0 + def * 1.25;
  }

  // 选择 Boss 的一手（同一回合内会被连续调用两次，第二次可见第一子）
  function chooseBossMove(board, size) {
    // 空盘：占天元
    if (isEmptyBoard(board, size)) {
      var mid = Math.floor(size / 2);
      return { row: mid, col: mid, tactic: '开局',
        reason: '影子分身现身，先落天元（中心）掌控全局' };
    }

    // 1. 自身可连五 → 直接取胜
    var aiWin = winPointsN(board, size, AI, 5);
    if (aiWin.length) {
      return { row: aiWin[0].row, col: aiWin[0].col, tactic: '制胜',
        reason: '影子分身·终结：落此子连成五子，本局取胜' };
    }

    // 2. 玩家即将四连获胜 → 必须封堵（两子可依次封两处，破解活三双端）
    var humanWin = winPointsN(board, size, HUMAN, 4);
    if (humanWin.length) {
      var b = humanWin[0], bs = -Infinity;
      for (var i = 0; i < humanWin.length; i++) {
        var s = bossScore(board, size, humanWin[i].row, humanWin[i].col);
        if (s > bs) { bs = s; b = humanWin[i]; }
      }
      return { row: b.row, col: b.col, tactic: '防守',
        reason: '影子分身·封杀：你只差一子即可四连获胜，此处是命门，先行封死' };
    }

    var moves = candidateMoves(board, size, 2);

    // 3. 自身可形成杀棋（活四/双冲四/四三/双活三）→ 强攻
    var atkKill = bestKillerMove(board, size, moves, AI);
    if (atkKill) {
      return { row: atkKill.row, col: atkKill.col, tactic: '进攻',
        reason: '影子分身·强攻：此手形成' + atkKill.combo + '，' +
          (comboDesc(atkKill.combo) || '构成多重威胁') + '，步步紧逼' };
    }

    // 4. 综合评分：防守偏重，主动瓦解玩家凑四连的苗头，同时扩张自身连势
    var best = null, bestScore = -Infinity;
    for (var j = 0; j < moves.length; j++) {
      var m = moves[j];
      var sc = bossScore(board, size, m.row, m.col) + Math.random() * 20;
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    best = best || moves[0];

    var atkVal = evaluatePointN(board, size, best.row, best.col, AI, 5);
    var defVal = evaluatePointN(board, size, best.row, best.col, HUMAN, 4);
    if (defVal > atkVal) {
      return { row: best.row, col: best.col, tactic: '防守',
        reason: '影子分身·压制：抢占你连子的关键点，遏制你的四连攻势' };
    }
    return { row: best.row, col: best.col, tactic: '进攻',
      reason: '影子分身·布局：扩张自身连势，同时封锁你的成线路线' };
  }

  /* ---------- 对外接口 ---------- */
  function chooseMove(board, size, difficulty) {
    var work = cloneBoard(board);

    // 开局：空棋盘直接占天元
    if (isEmptyBoard(work, size)) {
      var mid = Math.floor(size / 2);
      return {
        row: mid, col: mid,
        tactic: '开局',
        reason: '开局第一手，抢占天元（中心）以掌控全局'
      };
    }

    switch (difficulty) {
      case 'easy':   return moveEasy(work, size);
      case 'hard':   return moveHard(work, size);
      case 'medium':
      default:       return moveMedium(work, size);
    }
  }

  // 是否已连成 n 连（用于 Boss 玩法中玩家四连即胜的判定）
  function hasLine(board, size, r, c, player, target) {
    for (var d = 0; d < DIRS.length; d++) {
      var dr = DIRS[d][0], dc = DIRS[d][1];
      var count = 1;
      var i;
      for (i = 1; i < target; i++) {
        var nr = r + dr * i, nc = c + dc * i;
        if (!inBounds(nr, nc, size) || board[nr][nc] !== player) break;
        count++;
      }
      for (i = 1; i < target; i++) {
        var nr2 = r - dr * i, nc2 = c - dc * i;
        if (!inBounds(nr2, nc2, size) || board[nr2][nc2] !== player) break;
        count++;
      }
      if (count >= target) return true;
    }
    return false;
  }

  global.GomokuAI = {
    chooseMove: chooseMove,
    chooseBossMove: chooseBossMove,
    setDangerZone: setDangerZone,
    isWin: isWin,
    hasLine: hasLine,
    HUMAN: HUMAN,
    AI: AI,
    EMPTY: EMPTY,
    BLOCKED: BLOCKED
  };
// 兼容主线程（window）与 Web Worker（self）：Worker 中无 window
})(typeof self !== 'undefined' ? self : this);
