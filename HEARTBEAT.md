# HEARTBEAT.md

## Memory 整理
1. 读取最近 3 天的 `memory/YYYY-MM-DD.md` 文件
2. 检查是否有值得写入 `MEMORY.md` 的重要事项（决策、教训、新配置等）
3. 如有，更新 MEMORY.md；如无，跳过
4. 检查 MEMORY.md 中是否有过时信息需要清理

## 轻量健康检查
- 检查原油每日价格片段 WeChat cron `571fb419-b6a9-4542-91f6-9550bbceab09` 是否 enabled、下一次是否为 Tue-Sat 08:00 SGT。不要重启旧的 `crude-daily-snippet-weixin-scheduler.mjs`；它只是 2026-07-01 的临时方案。
