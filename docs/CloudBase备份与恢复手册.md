# CloudBase 备份与恢复手册

## 完整备份

确认 `.env` 中的 `CLOUDBASE_ENV_ID` 指向目标环境并完成 CloudBase CLI 登录，然后运行：

```bash
pnpm backup:cloud
```

脚本读取 `cloudbase/collections.json`，通过 `tcb db nosql dump` 将每个集合导出为 JSON。默认输出到 `.backups/<UTC时间>/`，成功后生成 `manifest.json`。该目录可能包含用户和业务数据，已被 Git 忽略，不得上传到仓库或公共网盘。

只检查计划、不访问云端：

```bash
pnpm backup:cloud -- --dry-run
```

指定受控存储目录：

```bash
pnpm backup:cloud -- --output D:\secure-backups\yulai
```

备份后记录环境、时间、集合数、存放位置和负责人，并抽查导出文件非空。

## 隔离恢复演练

生成恢复计划：

```bash
pnpm restore:plan -- --time "2026-09-10 14:00:00" --collections "users,activities"
```

计划只写入带时间后缀的新集合，避免覆盖现有数据。按输出依次执行：

1. 查询可回档时间范围。
2. 确认目标时间和集合可回档。
3. 回档到新的隔离集合。
4. 等待恢复任务完成。
5. 对比原集合与隔离集合的记录数，并抽查关键文档。
6. 记录任务号、耗时、数据时间点和核验结果。
7. 在 CloudBase 控制台人工确认后再处理隔离集合。

恢复演练不得使用现有业务集合名。正式环境覆盖恢复前，必须停止写入、创建新的全量备份，并制定逐集合切换和回滚步骤。

当前开发环境于 2026-09-10 完成全量导出，但隔离回档返回 OperationDenied；CloudBase 提示该能力需要标准版或以上套餐。升级套餐或建立支持回档的生产环境后，必须重新执行恢复演练。

若当前套餐不能使用平台回档，可用最新的 JSON 导出生成隔离导入清单：

```bash
pnpm restore:json-plan -- --backup .backups/<备份编号> --target-env <隔离环境ID>
```

脚本校验导出文件和空集合标记，拒绝把备份导回来源环境，并为每个集合生成新的 `_restored_` 名称。按清单在隔离环境创建新集合，使用 CloudBase 控制台的 JSON 导入功能逐一导入，再比对记录数、活动与报名关系。旧备份不含后来新增的集合时，脚本会列出缺项，不能将其算作完整恢复。头像等云存储文件和云函数环境变量不在数据库 JSON 中，必须另行备份、恢复并核验。完成一次实测前，发布门槛继续保持未通过。

## 验收口径

- 最近一次完整备份不超过 24 小时。
- 备份清单包含全部业务集合。
- 隔离恢复成功，抽查数据结构和关键关系正确。
- 从开始恢复到完成核验不超过 4 小时。
- 备份文件只保存在受控位置。

本项目当前使用 CloudBase CLI 3.8.1，其回档命令位于 `tcb db nosql backup` 下。能力说明依据 CloudBase CLI 文档：<https://docs.cloudbase.net/cli-v1/db/nosql/management>。
