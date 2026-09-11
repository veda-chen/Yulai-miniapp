# 羽来 Yulai

面向广州大学城羽毛球爱好者的微信组局小程序，帮助球友发现球局、创建活动、报名候补，并按需使用现场组队与计分功能。

> 当前版本已完成 M1–M4，首个试点场馆为广东工业大学大学城校区体育馆。

## 核心功能

- **发现与组局**：浏览公开球局、搜索筛选、创建和编辑活动
- **报名管理**：报名、候补、退出、截止后人工递补和到场确认
- **个人资料**：维护昵称、羽毛球水平和可选学校信息
- **活动治理**：关键变更确认、取消或结束活动、举报与管理员处置
- **现场模式（可选）**：整轮双打分组、手工建对局、参与者录分、比分确认与锁定战绩
- **场馆信息**：展示试点场馆及场地信息

组队和计分不会成为创建球局的必选流程；小程序当前不提供线上支付、订单、退款或平台收款能力。

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 小程序端 | 微信原生小程序、TypeScript、WXML、WXSS |
| 服务端 | 微信云开发 CloudBase、Node.js、TypeScript |
| 数据与鉴权 | CloudBase 数据库、`wx.cloud.callFunction`、`getWXContext` |
| 工程化 | pnpm workspace、Biome、Vitest |

客户端统一调用 `api` 云函数，云函数通过微信上下文获取可信用户身份，客户端不传递 `openid`。

## 项目结构

```text
.
├─ apps/
│  ├─ miniprogram/       # 微信小程序
│  └─ admin/             # 运营管理端占位
├─ cloudfunctions/api/   # 模块化云函数 API
├─ cloudbase/            # 集合、索引、安全规则和种子数据
├─ packages/shared/      # 跨端共享类型与契约
├─ scripts/              # 构建、部署和里程碑校验脚本
└─ docs/                 # 产品、架构与阶段实现文档
```

## 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 22 或更高版本
- [pnpm](https://pnpm.io/) 11
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 已开通微信云开发的微信小程序账号

### 安装与构建

```bash
pnpm install
pnpm build
```

随后使用微信开发者工具打开仓库根目录，并在项目配置中确认使用自己的云开发环境。

### 配置云开发

复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

在 `.env` 中配置：

```dotenv
CLOUDBASE_ENV_ID=your-cloudbase-environment-id
OPENID_HASH_SECRET=your-random-secret-at-least-32-characters
```

`.env` 仅用于本地部署，不应提交到 Git。部署统一云函数：

```bash
pnpm cloud:deploy
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `pnpm build` | 构建全部工作区包 |
| `pnpm test` | 运行自动化测试 |
| `pnpm typecheck` | 执行 TypeScript 类型检查 |
| `pnpm lint` | 执行 Biome 静态检查 |
| `pnpm format` | 格式化项目文件 |
| `pnpm check` | 运行格式、静态检查、类型检查、测试和 M1–M4 校验 |
| `pnpm cloud:check` | 检查本地云开发配置 |
| `pnpm cloud:deploy` | 构建并部署 `api` 云函数 |
| `pnpm backup:cloud` | 将 CloudBase 业务集合备份到本地忽略目录 |
| `pnpm restore:plan` | 生成写入隔离集合的恢复演练计划 |
| `pnpm release:check` | 执行候选版检查并验证人工发布门槛 |

## 项目文档

- [产品需求文档](docs/羽来PRD_V0.1.md)
- [项目章程与 V1 范围](docs/项目章程与V1需求范围_V0.1.md)
- [技术架构与开发排期](docs/羽来技术架构设计和开发排期_V0.1.md)
- [采用微信云开发的架构决策](docs/ADR-001-采用微信云开发.md)
- [M1 工程基线](docs/M1工程基线.md)
- [M2 基础资料模块](docs/M2基础资料模块.md)
- [M3 运营与通知模块](docs/M3运营与通知模块.md)
- [M4 可选现场功能](docs/M4可选现场功能.md)
- [M5 试点候选版](docs/M5试点候选版.md)
- [CloudBase 备份与恢复手册](docs/CloudBase备份与恢复手册.md)

## 当前进度

- [x] M1：工程基线与云开发接入
- [x] M2：用户、学校、场馆与球局基础流程
- [x] M3：活动运营、通知、举报与管理能力
- [x] M4：可选分组、计分、确认和战绩能力
- [ ] M5：自动候选版基线已完成，等待人工发布门槛
- [x] 微信订阅消息发送：正式模板、授权去重、字段映射、加密接收映射和定时发送已接入
- [x] 运营管理端：举报分类、对象处置、历史结果与审计记录
- [ ] 试点场馆真实用户验证

## 许可证

本项目采用 [MIT License](LICENSE)。
