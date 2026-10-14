# 云开发环境设置

## 环境

M1 开发环境为 `cloud1-d1g8z3590d3768cbb`。小程序按微信版本选择开发、体验或正式环境；体验和正式环境 ID 必须显式配置，缺失时启动会失败。正式发布前另建生产环境，开发和生产不能共用数据。复制 `.env.example` 为 `.env`，填入环境 ID 和随机密钥，然后运行 `pnpm cloud:check`。

## 数据库

根据 `collections.json` 创建集合和索引。所有集合的客户端权限设为 `ADMINONLY`，业务数据只允许通过 `api` 云函数访问。这样可见性、正式参与者和管理员权限始终由服务端判断。

“打球鸭”邀请上线前，执行 `play-invitation-commands.json` 创建 `playInvitations` 与 `playInvitationReplies` 集合及索引，客户端权限均设为 `ADMINONLY`。先部署包含邀请接口的云函数，再上传小程序版本；老环境缺少这两个集合时，创建和回应会失败。注销账号会删除其邀请回应，并匿名化其发起的邀请。

已有环境升级个性化设置功能时，先执行 `u5-appearance-commands.json` 创建 `appearancePreferences` 集合及用户唯一索引，再部署新版 `api` 云函数。客户端在集合和接口部署完成前会保留本机设置，不会丢失外观偏好。

全局个性化组件 V3 不增加集合。升级时必须先部署兼容 V3 的 `api` 云函数，再提供 V3 客户端。服务端会在读取 V1/V2 配置时补齐新字段；旧客户端继续保存 V1/V2 配置时，会保留云端记录已有的 V3 组件字段，避免旧设备覆盖新设备的设置。

工具箱扩展将个性化设置升级到 V4，但仍不增加集合。必须先部署兼容 V4 的 `api` 云函数，再上传 V4 客户端。服务端会在 V3 工具顺序后追加轮转、抽签、费用和规则工具；旧客户端保存 V1–V3 配置时，会保留云端已有的首页工具选择，并只更新原有快速分组与临时计分的相对顺序。工具名单、轮次、抽签结果和费用明细不进入云函数或云数据库。

导入 `seeds/venues.json` 前，将 `SERVER_DATE` 替换为控制台支持的服务端日期或由初始化脚本写入。试点场馆保持 `PENDING_VERIFICATION`，直到名称、地址、场地图和场地编号现场核验完成。

## 云函数

体验优化版本新增 `activity.latestCreated` 和服务端组合找局筛选。已有开发环境先执行 `experience-index-commands.json`，再部署兼容云函数，最后上传客户端开发版本。索引包含组织者最近创建球局查询，以及公开球局按场馆、水平和开始时间查询；关键词与余位由服务端在分页前匹配，单次扫描达到上限时返回继续位置。

本轮优化在部署新版云函数前还需执行 `optimization-index-commands.json`。它支持本人球局统计、通知重试和租约回收。旧通知任务仍以 `PENDING` 处理；`VERIFY_REQUIRED` 表示发送结果需要人工核对，不能直接重发。

同时执行 `file-cleanup-commands.json` 创建 `fileCleanupJobs` 集合和索引，并将客户端权限设为 `ADMINONLY`。注销时在事务内写入头像清理任务；每日维护触发器重试失败的文件删除。未创建此集合前不要部署包含注销改动的云函数。

为 `api` 云函数配置 `OPENID_HASH_SECRET`，不少于 32 个随机字符。开发和生产使用不同值。`cloudbaserc.json` 已固定 Node.js 20.19、入口、超时和内存，运行 `pnpm cloud:deploy` 可先构建再部署。

小程序环境 ID 由 `scripts/generate-cloud-env.mjs` 根据 `.env` 生成。开发版本默认使用 M1 环境；体验和正式版本必须分别设置 `TRIAL_CLOUDBASE_ENV_ID`、`PRODUCTION_CLOUDBASE_ENV_ID`。正式云函数部署使用 `pnpm cloud:deploy:release`，该命令先运行发布门槛并确认正式环境 ID、`WECHAT_MINIPROGRAM_STATE=formal`，以及 `RELEASE_VERSION` 与 `package.json` 一致。上传微信版本时也应使用该版本号并记录在发布清单旁。

## 验收

1. 小程序首页显示“云开发连接正常”。
2. 调用 `auth.session` 首次创建用户，再次调用返回同一用户且 `isNew` 为 false。
3. 客户端直接读取或写入任一业务集合均被拒绝。
4. 云函数日志包含 requestId，但不包含 openid、密钥或完整联系方式。

## 2026年9月8日云端执行结果

- `api` 云函数已部署，`health.get` 云端调用返回正常。
- 8 个业务集合及规划索引已创建。
- 8 个集合的权限已逐个回读，均为 `ADMINONLY`。
- 广东工业大学大学城校区体育馆已写入，状态保持 `PENDING_VERIFICATION`。
- 开发者工具连续两次启动后，用户集合记录数保持为1，会话初始化未重复建档。
