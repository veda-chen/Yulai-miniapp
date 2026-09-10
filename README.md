# 羽来

广州大学城羽毛球组局微信小程序。V1 以发现、创建、报名和候补为主流程，组队和计分为球局可选功能。

当前已完成 CloudBase M1 至 M4。用户可以维护个人昵称、可选学校与水平，查看试点场馆，创建或编辑球局，浏览公开球局，并完成报名、候补、退出、变更确认与到场管理。

M3增加关键变更确认、活动取消与结束、到场管理、截止后人工递补、站内通知、举报和管理员运营处置。微信订阅消息模板将在公众平台类目与模板确定后接入，现阶段通知授权不影响报名和组局。

M4增加可选现场模式：整轮双打分组、组织者调整与发布、独立手工建对局、参与者录分、双方确认自动锁定、冲突处理、解锁修订和锁定战绩。

小程序主页面已按 `yulai-ui-redesign.design` 落地为蓝色轻量视觉，包括首页 Hero、球局卡片与搜索、详情信息卡、分组创建表单、个人主页和原生四栏 TabBar；Hero 图片已作为小程序本地资源打包。

## 本地开始

1. 安装 Node.js 22 或更高版本以及 pnpm 11。
2. 运行 `pnpm install` 和 `pnpm build`。
3. 用微信开发者工具打开仓库根目录；M1 小程序已绑定开发环境 `cloud1-d1g8z3590d3768cbb`。
4. 将 `.env.example` 复制为 `.env`，配置开发环境 ID 和本地专用 HMAC 密钥。
5. 运行 `pnpm cloud:deploy` 构建并部署 `cloudfunctions/api`。

小程序使用 `wx.cloud.callFunction` 调用统一的 `api` 云函数。云函数通过 `getWXContext` 获取可信的微信身份，客户端不传 openid。

## 工作区

- `apps/miniprogram` 微信小程序
- `cloudfunctions/api` TypeScript 模块化云函数
- `cloudbase` 集合、索引、安全和种子数据基线
- `apps/admin` 运营管理端占位，后续通过管理员云函数接入
- `packages/shared` 跨端共享契约
- `docs` 产品和技术文档

运行 `pnpm check` 执行格式、静态检查、类型检查、测试和 M1 基线校验。
