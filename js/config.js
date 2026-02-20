// js/config.js
// 此文件可以安全地公开在仓库中，不含任何敏感信息
// 所有配置在运行时从 /api/config 获取（由 CF Pages Functions 提供）

const CONFIG = {
  // 运行时从服务端填充，初始为空
  supabase: {
    url: '',
    publishableKey: '',
  },

  defaultLang: 'zh',

  // settings 默认值，init() 后会被服务端覆盖
  settings: {
    showHistory: false,
    allowMessages: true,
    requireContact: false,
    maxMessageLength: 2000,
    dailyLimit: 0,
  },

  storage: {
    visitorId: 'mssk_visitor_id',
    lang: 'mssk_lang',
    adminAuthed: 'mssk_admin_authed',
  },

  async init() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('无法加载配置');
    const remote = await res.json();
    this.supabase.url = remote.supabaseUrl;
    this.supabase.publishableKey = remote.supabasePublishableKey;
    this.defaultLang = remote.defaultLang ?? 'zh';
    if (remote.settings) this.settings = { ...this.settings, ...remote.settings };
  },
};