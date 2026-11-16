// 模擬玩家策略介面（玩法深度擴充基礎，僅骨架）。
//
// 策略物件：{ id, participates }。預設策略不參與任何新系統（participates: false），
// applySimPolicy 在本階段為空實作：原樣回傳 state，不修改、不呼叫 rng。
// 後續功能若需策略參與，於此擴充。

export function defaultSimPolicy() {
  return { id: 'none', participates: false };
}

export function applySimPolicy(state, policy = defaultSimPolicy(), ctx = {}) {
  void policy;
  void ctx;
  return state;
}
