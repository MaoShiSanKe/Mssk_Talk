# Mssk_Talk

一个部署在 Cloudflare Pages 上的匿名留言板，后端使用 Supabase 存储数据。

设计风格简洁克制，以表单为核心，支持暗色模式、中英双语。

## 功能概览

**用户端**
- 匿名发送留言（支持图片链接、联系方式）
- 查看历史留言及管理员回复
- 置顶消息入口（管理员开启后显示）
- 漂浮留言墙背景（管理员开启后显示，气泡在背景缓慢漂移）
- 中英双语切换
- 亮色 / 暗色主题切换

**管理端**（`/admin`）
- 查看所有留言，按用户分组，支持折叠/展开
- 搜索留言（关键词高亮）
- 过滤：全部 / 仅未读 / 显示已屏蔽 / 屏蔽词拦截
- 标为已读、手动屏蔽/解除屏蔽消息
- 对用户添加备注、屏蔽/解封用户
- 回复留言（支持编辑、删除历史回复，可勾选发送邮件通知用户）
- 精选消息（加入漂浮留言墙）、置顶消息
- 针对性导出 CSV（可选范围、是否含屏蔽消息）
- 系统设置（开关和数值配置，实时生效）
- 屏蔽词管理（自动拦截含屏蔽词的留言，可放行或删除）
- 访客统计（总数、今日新增、近7天消息量柱状图）
- 暖色 / 冷色配色方案切换

**防垃圾**
- Honeypot 隐藏字段
- IP 速率限制（每分钟最多3条）
- 最短发送间隔（10秒）
- 每日留言上限（可配置）
- 屏蔽词自动拦截

## 项目结构

```
├── index.html              # 用户端
├── admin.html              # 管理端
├── schema.sql              # 数据库初始化脚本
├── css/
│   ├── main.css            # 用户端样式
│   └── admin.css           # 管理端样式
├── js/
│   ├── config.js           # 配置加载
│   ├── i18n.js             # 国际化
│   ├── supabase.js         # 数据库操作封装
│   ├── visitor.js          # 访客 UUID 管理
│   ├── bubbles.js          # 漂浮留言墙动画
│   ├── theme.js            # 主题/配色切换
│   ├── main.js             # 用户端逻辑
│   └── admin.js            # 管理端逻辑
├── i18n/
│   ├── zh.json             # 中文语言包
│   └── en.json             # 英文语言包
└── functions/
    └── api/
        ├── config.js       # 下发配置和精选/置顶数据
        ├── message.js      # 接收留言（含防垃圾、屏蔽词检测）
        ├── visitor.js      # 访客注册
        └── admin.js        # 管理员操作代理
```

## 部署

### 1. Supabase

1. 新建项目，在 SQL Editor 中执行 `schema.sql`
2. 记录以下信息：
   - Project URL
   - `anon` public key（publishable key）
   - `service_role` secret key

### 2. Cloudflare Pages

1. Fork 本仓库，在 Pages 中连接 GitHub 仓库
2. 构建设置：框架预设选 `None`，构建命令留空，输出目录填 `/`
3. 在 **Settings → Environment Variables** 中添加：

| 变量名 | 说明 |
|--------|------|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | anon public key |
| `SUPABASE_SECRET_KEY` | service_role secret key |
| `ADMIN_PASSWORD` | 管理员登录密码 |
| `NOTIFY_TG_TOKEN` | （可选）Telegram Bot Token |
| `NOTIFY_TG_CHAT_ID` | （可选）Telegram Chat ID |
| `NOTIFY_RESEND_KEY` | （可选）Resend API Key |
| `NOTIFY_EMAIL_FROM` | （可选）发件邮箱（需在 Resend 验证域名） |
| `NOTIFY_EMAIL_TO` | （可选）收件邮箱 |

4. 部署完成后访问 `/admin` 输入密码登录

### 消息通知（可选）

支持 Telegram 和邮件两种通知方式，配置对应环境变量即可，两者独立可同时启用。

邮件通知使用 [Resend](https://resend.com)（免费额度 3000 封/月），需要验证发件域名。

## 数据库表说明

| 表名 | 说明 |
|------|------|
| `visitors` | 访客记录（UUID、是否屏蔽、备注） |
| `messages` | 留言（内容、图片、联系方式、各状态标记） |
| `replies` | 管理员回复 |
| `settings` | 系统配置键值对 |
| `blocked_words` | 屏蔽词列表 |

## License

MIT