/* ============================================================
 * ai-worker.js — 在后台线程运行 AI 搜索
 * 通过 importScripts 复用 ai.js（其内部以 self 作为全局对象暴露 GomokuAI）
 * 消息协议：
 *   收 { id, board, size, difficulty }
 *   回 { id, move }        move 即 GomokuAI.chooseMove 的返回值
 *      { id, error }       计算异常时回传错误信息
 * 说明：仅 hard 难度值得放到后台（深度搜索最长约 1s），
 *      但这里对所有难度一视同仁，主线程决定是否使用 Worker。
 * ============================================================ */
/* global importScripts, GomokuAI */
importScripts('ai.js');

self.onmessage = function (e) {
  var data = e.data || {};
  try {
    // 地形吞噬：主线程把危险圈随消息带来，Worker 内同步设置后再计算，
    // 使后台搜索与主线程同步计算行为一致（AI 规避即将塌陷的外圈）。
    if (GomokuAI.setDangerZone) GomokuAI.setDangerZone(data.danger || null);
    var move = GomokuAI.chooseMove(data.board, data.size, data.difficulty);
    self.postMessage({ id: data.id, move: move });
  } catch (err) {
    self.postMessage({ id: data.id, error: String(err && err.message || err) });
  }
};
