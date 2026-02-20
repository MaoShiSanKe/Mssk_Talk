// ============================================================
// visitor.js — 用户身份管理
// 用 localStorage 持久化 UUID，用户无感知但 ID 稳定
// ============================================================

const Visitor = (() => {
  let _id = null;

  async function init() {
    const stored = localStorage.getItem(CONFIG.storage.visitorId);
    if (stored) {
      // 验证是否在数据库中存在
      const visitor = await DB.getVisitor(stored).catch(() => null);
      if (visitor) {
        _id = stored;
        return _id;
      }
    }
    // 新建访客
    const visitor = await DB.createVisitor();
    _id = visitor.id;
    localStorage.setItem(CONFIG.storage.visitorId, _id);
    return _id;
  }

  function getId() { return _id; }

  return { init, getId };
})();
