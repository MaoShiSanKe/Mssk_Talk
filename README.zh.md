# Mssk_Talk

> 匿名留言板，配备完整的管理后台。基于 Cloudflare Pages + Supabase 构建，无需独立后端，零运维部署。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Cloudflare Pages](https://img.shields.io/badge/部署于-Cloudflare%20Pages-orange?logo=cloudflare)](https://pages.cloudflare.com)
[![Supabase](https://img.shields.io/badge/数据库-Supabase-3ECF8E?logo=supabase)](https://supabase.com)

**Demo：** https://mssk.cc.cd &nbsp;|&nbsp; [English](./README.md)

<table style="width: 100%; border-collapse: collapse;">
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/7f511a07-f190-45ef-8d89-370401169ea0" width="100%">
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/2fa15c05-6e75-4677-b43b-69d36be77372" width="100%">
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/7c6039c3-cbec-4eab-bc72-dbe12f94218f" width="100%">
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/22a16c34-e130-4379-a912-960739037860" width="100%">
    </td>
  </tr>
</table>

---

## 核心亮点

- **真正匿名** — 访客通过 `localStorage` 中的 UUID 识别，无需注册账号
- **静默拦截** — 屏蔽词命中后消息正常写入但不通知发送者，由管理员审核决定是否放行
- **公开留言板** — 管理员可选择性地将留言公开，所有访客均可浏览
- **漂浮留言墙** — 精选留言以气泡形式在页面背景漂移，可完全自定义
- **多语言支持** — 内置中文、英文、韩文，新增语言只需一个 JSON 文件
- **零基础设施** — Cloudflare Pages Functions 处理所有服务端逻辑，Supabase 是唯一外部依赖

---

## 快速开始

**1. 配置 Supabase**

新建项目，在 SQL Editor 中执行 [`schema.sql`](./schema.sql)。记录 Project URL、`anon` key 和 `service_role` key。

**2. 部署到 Cloudflare Pages**

Fork 本仓库并连接到 Cloudflare Pages，参考 [`.env.example`](./.env.example) 添加以下环境变量：

| 变量名 | 说明 |
|--------|------|
| `SUPABASE_URL` | Supabase Project URL |
| `SUPABASE_PUBLISHABLE_KEY` | anon public key |
| `SUPABASE_SECRET_KEY` | service_role secret key |
| `ADMIN_PASSWORD` | 管理员登录密码 |
| `KEEPALIVE_SECRET` | *（可选）* 数据库保活端点的验证密钥 |
| `NOTIFY_TG_TOKEN` | *（可选）* Telegram Bot Token |
| `NOTIFY_TG_CHAT_ID` | *（可选）* Telegram Chat ID |
| `NOTIFY_RESEND_KEY` | *（可选）* Resend API Key |
| `NOTIFY_EMAIL_FROM` | *（可选）* 发件邮箱（需在 Resend 验证域名） |
| `NOTIFY_EMAIL_TO` | *（可选）* 收件邮箱 |

构建设置：框架预设选 `None`，构建命令留空，输出目录填 `/`。

**3. 完成**

访问 Pages 域名即可使用留言板，进入 `/admin` 输入密码登录管理后台。

> **通知功能**可选，Telegram、邮件、Webhook 相互独立，按需配置。
> 邮件通知使用 [Resend](https://resend.com)（免费额度 3000 封/月），需验证发件域名。

> **数据库保活** — Supabase 免费项目 7 天不活跃会被暂停。启用保活 workflow 可每 5 天自动 ping 数据库。详见[数据库保活](#数据库保活)。

---

## 功能详情

<details>
<summary><strong>用户端</strong></summary>

- 匿名发送留言，支持图片链接和联系方式
- 名片设置：可选昵称、头像链接、签名，自动保存到本地和数据库
- 查看历史留言及管理员回复
- 置顶消息入口（管理员开启后显示）
- 公开留言板：管理员精选公开的留言，所有访客可见
- 漂浮留言墙背景（气泡动画，管理员开启后显示）
- 语言切换菜单，内置中文、英文、韩文
- 亮色 / 暗色主题切换

</details>

<details>
<summary><strong>管理端</strong>（<code>/admin</code>）</summary>

- 留言按用户分组，支持折叠/展开，分页浏览，支持页码直接跳转
- 关键词搜索，结果高亮显示
- 过滤：全部 / 仅未读 / 手动屏蔽 / 屏蔽词拦截
- 标为已读、屏蔽/解除屏蔽消息、屏蔽/解封用户、添加用户备注
- 查看访客名片（昵称、头像、签名）
- 回复留言，支持编辑和删除历史回复，可勾选发送邮件通知用户
- 公开/取消公开留言（公开后在用户端留言板可见）
- 精选消息加入漂浮留言墙，精选管理面板可快速取消精选
- 置顶消息
- 针对性导出 CSV，可选范围及是否包含屏蔽消息
- 系统设置：留言板标题/副标题、功能开关、数值限制，实时生效
- Webhook：新留言时向自定义 URL 发送 POST 请求
- 屏蔽词管理：添加/删除屏蔽词，对被拦截消息放行或删除
- 访客统计：总访客数、今日新增、近 7 天消息量柱状图
- 管理端完整国际化，语言切换菜单
- 暖色 / 冷色配色方案切换

</details>

<details>
<summary><strong>防垃圾</strong></summary>

- Honeypot 隐藏字段
- IP 速率限制（每分钟最多 3 条）
- 最短发送间隔（10 秒）
- 每日留言上限（可配置，0 为不限制）
- 屏蔽词静默拦截，用户无感知，管理员可放行

</details>

---

## 项目结构

```
├── index.html              # 用户端
├── admin.html              # 管理端
├── schema.sql              # 数据库初始化脚本
├── .env.example            # 环境变量参考
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
│   ├── zh.json             # 中文（基准语言包）
│   ├── en.json             # 英文
│   └── kr.json             # 韩文
├── functions/
│   └── api/
│       ├── config.js       # 下发配置、精选、置顶和公开留言数据
│       ├── message.js      # 接收留言（防垃圾、屏蔽词检测、通知）
│       ├── visitor.js      # 访客名片更新
│       ├── admin.js        # 管理员操作代理
│       └── keepalive.js    # 数据库保活端点
├── docs/
│   ├── architecture.md     # 系统架构和数据流
│   ├── api.md              # API 接口说明
│   ├── database.md         # 数据库表结构说明
│   └── roadmap.md          # 功能规划和设计决策记录
└── .github/
    ├── workflows/
    │   ├── lint.yml        # JS 语法、JSON 格式、i18n 完整性检查
    │   └── keepalive.yml   # 数据库保活定时任务
    └── ISSUE_TEMPLATE/
        ├── bug_report.yml
        └── feature_request.yml
```

---

## 数据库

共五张表，均启用 RLS。执行 [`schema.sql`](./schema.sql) 完成初始化。

| 表名 | 说明 |
|------|------|
| `visitors` | UUID、屏蔽状态、备注、名片信息 |
| `messages` | 留言内容、图片、联系方式、各状态标记（屏蔽、精选、置顶、公开、屏蔽词） |
| `replies` | 管理员回复（含编辑记录） |
| `settings` | 系统配置键值对 |
| `blocked_words` | 屏蔽词列表 |

---

## 数据库保活

Supabase 免费项目 7 天不活跃会自动暂停。Mssk_Talk 内置保活机制，通过 GitHub Actions 每 5 天自动 ping 数据库。

**配置步骤：**

1. 生成随机密钥：
   ```bash
   openssl rand -hex 32
   ```

2. 添加到 **Cloudflare Pages** 环境变量：
   - `KEEPALIVE_SECRET` → 上面生成的密钥

3. 添加到 **GitHub 仓库** Secrets（Settings → Secrets → Actions）：
   - `KEEPALIVE_SECRET` → 同上
   - `SITE_URL` → 你的 Pages 域名，如 `https://your-site.pages.dev`

4. `.github/workflows/keepalive.yml` 每 5 天自动运行。也可在 Actions 页面手动触发验证配置是否正确。

---

## 参与贡献

欢迎提 Issue 和 Pull Request，详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

---

## License

[MIT](./LICENSE)