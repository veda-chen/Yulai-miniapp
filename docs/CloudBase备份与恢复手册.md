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

## 验收口径

- 最近一次完整备份不超过 24 小时。
- 备份清单包含全部业务集合。
- 隔离恢复成功，抽查数据结构和关键关系正确。
- 从开始恢复到完成核验不超过 4 小时。
- 备份文件只保存在受控位置。

命令依据 CloudBase CLI 文档：<https://docs.cloudbase.net/cli-v1/db/nosql/management>。
