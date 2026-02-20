// js/config.js
// 此文件可以安全地公开在仓库中，不含任何敏感信息
// 所有配置在运行时从 /api/config 获取（由 CF Pages Functions 提供）

const CONFIG = {
  // 运行时从服务端填充，初始为空
  supabase: {
    url: '',
    publishableKey: '',
  },

  // 管理员密码不在前端存储，验证通过 /api/auth 进行
  // secret key 不在前端，由 /api/admin 代理使用

  defaultLang: 'zh',

  storage: {
    visitorId: 'mssk_visitor_id',
    lang: 'mssk_lang',
    // 管理员 session：只存是否已验证，不存密码
    adminAuthed: 'mssk_admin_authed',
  },

  // 初始化：从服务端拉取配置
  async init() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('无法加载配置');
    const remote = await res.json();
    this.supabase.url = remote.supabaseUrl;
    this.supabase.publishableKey = remote.supabasePublishableKey;
    this.defaultLang = remote.defaultLang ?? 'zh';
  },
};
