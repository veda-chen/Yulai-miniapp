# 羽来 Yulai

[![CI](https://github.com/veda-chen/Yulai-miniapp/actions/workflows/ci.yml/badge.svg)](https://github.com/veda-chen/Yulai-miniapp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

羽来是面向广州大学城羽毛球爱好者的微信组局小程序。它以公开组局为主流程，帮助球友发现和创建球局、报名或候补，并按需启用现场组队与计分。

项目正在准备试点候选版，首个试点场馆为广东工业大学大学城校区体育馆。M1–M4 功能与 M5 自动化基线已经完成；正式上线仍需完成微信平台配置、隐私声明、场馆现场核验、两台真机验收和备份恢复演练。

## 功能

- **发现与组局**：浏览公开球局、搜索筛选、创建、编辑、取消和结束活动
- **报名与候补**：报名、退出、候补、截止后人工递补、到场状态管理
- **个人资料**：维护昵称、可选头像、羽毛球水平和可选学校信息
- **消息通知**：站内通知，以及报名候补、递补、球局变更和取消的微信订阅消息
- **场馆信息**：展示地址、入口、开放说明、设施、封面、平面图和核验状态
- **运营管理**：维护场馆资料，处理举报、下架球局、限制账号并记录审计日志
- **现场模式（可选）**：整轮双打分组、手工建对局、参与者录分、比分确认与战绩

组队和计分不会成为创建球局的必选步骤。项目当前不提供线上支付、订单、退款或平台收款能力。

## 技术架构

| 层级 | 技术 |
| --- | --- |
| 小程序端 | 微信原生小程序、TypeScript、WXML、WXSS |
| 服务端 | 微信云开发 CloudBase、Node.js、TypeScript |
| 数据与鉴权 | CloudBase 数据库、`wx.cloud.callFunction`、`getWXContext` |
| 工程化 | pnpm workspace、Biome、Vitest、GitHub Actions |

小程序统一调用 `api` 云函数。服务端从微信上下文获取可信用户身份，客户端不提交 `openid`；业务集合保持仅管理员直连，普通用户通过云函数访问数据。

## 项目结构

```text
.
├─ apps/miniprogram/       # 微信原生小程序
├─ cloudfunctions/api/     # 模块化云函数 API
├─ cloudbase/              # 集合、索引、安全规则和种子数据
├─ packages/shared/        # 跨端共享类型与契约
├─ scripts/                # 构建、部署、备份和里程碑校验脚本
├─ release/                # M5 发布门槛与性能结果
└─ docs/                   # 产品、架构、运营和验收文档
```

## 本地运行

### 环境要求

- [Node.js](https://nodejs.org/) 22 或更高版本
- [pnpm](https://pnpm.io/) 11
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 已开通微信云开发的小程序账号和 CloudBase 环境

### 1. 安装依赖

```bash
pnpm install --frozen-lockfile
```

### 2. 配置云开发

```powershell
Copy-Item .env.example .env
```

填写 `.env`：

```dotenv
CLOUDBASE_ENV_ID=your-cloudbase-environment-id
OPENID_HASH_SECRET=your-random-secret-at-least-32-characters
SUBSCRIPTION_OPENID_KEY=another-random-secret-at-least-32-characters
WECHAT_MINIPROGRAM_STATE=developer
```

`WECHAT_MINIPROGRAM_STATE` 可设为 `developer`、`trial` 或 `formal`。`.env` 包含本地部署密钥，不应提交到 Git。

检查配置并构建：

```bash
pnpm cloud:check
pnpm build
```

首次创建集合、索引和种子数据时，按照 [CloudBase 初始化说明](cloudbase/SETUP.md) 操作。随后部署统一云函数：

```bash
pnpm cloud:deploy
```

### 3. 打开小程序

使用微信开发者工具导入仓库根目录。工具会读取 `project.config.json`，小程序源码目录为 `apps/miniprogram/`，云函数目录为 `cloudfunctions/`。

如果在自己的小程序账号下运行，请将 `project.config.json` 中的 `appid` 改成对应 AppID，并确保所选云环境与 `.env` 一致。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm build` | 构建全部工作区包 |
| `pnpm test` | 运行自动化测试 |
| `pnpm typecheck` | 执行 TypeScript 类型检查 |
| `pnpm lint` | 执行 Biome 静态检查 |
| `pnpm format` | 格式化项目文件 |
| `pnpm check` | 运行格式、lint、类型、测试和 M1–M5 自动校验 |
| `pnpm cloud:check` | 检查本地 CloudBase 配置 |
| `pnpm cloud:deploy` | 构建并部署 `api` 云函数及定时触发器 |
| `pnpm performance:cloud -- 20 5` | 对公开云接口执行受控性能测试 |
| `pnpm backup:cloud` | 将业务集合备份到本地忽略目录 |
| `pnpm restore:plan` | 生成写入隔离集合的恢复演练计划 |
| `pnpm release:check` | 执行完整候选版检查和人工发布门槛校验 |

## 当前进度

- [x] M1：工程基线与微信云开发接入
- [x] M2：用户、学校、场馆、球局、报名和候补基础流程
- [x] M3：活动运营、站内通知、正式订阅消息、举报和管理能力
- [x] M4：可选分组、参与者计分、确认和战绩能力
- [x] M5：自动候选版基线、CI、备份脚本、性能脚本和发布门槛
- [x] 场馆核验资料、封面和平面图的管理员维护页面
- [ ] 微信公众平台、隐私保护指引和生产环境最终配置
- [ ] 广东工业大学大学城校区体育馆现场资料核验
- [ ] 至少两台真机完成主流程和订阅消息验收
- [ ] CloudBase 标准版环境完成隔离恢复演练

M5 的人工门槛和证据记录在 [`release/m5-gates.json`](release/m5-gates.json)。门槛未全部通过时，`pnpm release:check` 会失败，以阻止把候选版误判为可发布版本。

## 文档

- [产品需求文档](docs/羽来PRD_V0.1.md)
- [项目章程与 V1 范围](docs/项目章程与V1需求范围_V0.1.md)
- [技术架构与开发排期](docs/羽来技术架构设计和开发排期_V0.1.md)
- [微信云开发架构决策](docs/ADR-001-采用微信云开发.md)
- [M3 运营与通知模块](docs/M3运营与通知模块.md)
- [M4 可选现场功能](docs/M4可选现场功能.md)
- [M5 试点候选版](docs/M5试点候选版.md)
- [微信订阅消息接入说明](docs/微信订阅消息接入说明.md)
- [隐私与微信审核清单](docs/隐私与微信审核清单.md)
- [试点场馆核验表](docs/试点场馆核验表.md)
- [CloudBase 备份与恢复手册](docs/CloudBase备份与恢复手册.md)

## 隐私与数据

学校信息和头像均为可选项。用户可以清空可选资料或注销账号；注销后个人展示信息会匿名化，最小账号关联信息按项目留存规则定期清理。相册、相机和订阅消息等能力必须与微信公众平台隐私保护指引中的实际声明保持一致。

## 许可证

本项目采用 [MIT License](LICENSE)。
