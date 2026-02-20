# mssk-message

匿名留言板，基于 Cloudflare Pages + Supabase。

## 部署

### 1. Supabase 建表

在 Supabase SQL Editor 执行 `schema.sql`（见仓库根目录）。

### 2. 部署到 Cloudflare Pages

连接此仓库，构建设置全部留空（纯静态 + Functions）。

### 3. 设置环境变量

在 CF Pages → Settings → Environment variables 中添加：

| 变量名 | 说明 |
|--------|------|
| `SUPABASE_URL` | Supabase 项目 URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase Publishable Key |
| `SUPABASE_SECRET_KEY` | Supabase Secret Key |
| `ADMIN_PASSWORD` | 管理后台登录密码 |

### 4. 绑定域名

在 CF Pages 自定义域名中绑定你的域名。

## 文件结构

```
├── index.html          # 用户留言页
├── admin.html          # 管理后台
├── _redirects          # CF Pages 路由
├── functions/
│   └── api/
│       ├── auth.js     # 管理员验证
│       ├── config.js   # 配置下发
│       └── admin.js    # 管理操作代理
├── i18n/
│   └── zh.json         # 中文语言包
└── js/
    ├── config.js       # 前端配置（无敏感信息）
    ├── supabase.js     # 数据库操作
    ├── i18n.js         # 多语言
    ├── visitor.js      # 用户身份
    ├── main.js         # 用户前端逻辑
    └── admin.js        # 管理后台逻辑
```
