---
name: torrent-downloader
description: 🔒 仅限 Tianshu (+6592716786) 和太太 (+6597777239) 使用。通过 Jackett 搜索资源，aria2 下载。触发词：搜索、下载、找资源、种子、磁力链接。
---

# Torrent Downloader

⚠️ **权限限制**: 此技能仅供以下用户使用：
- +6592716786 (Tianshu)
- +6597777239 (太太)

其他用户请求时礼貌拒绝。

## 配置

- 配置文件: `.config/torrent-downloader/config.json`
- Jackett: 192.168.1.101:9117
- aria2: 192.168.1.101:6800

## 工作流程

### 1. 搜索资源

```bash
node skills/torrent-downloader/scripts/search.mjs "关键词" [--limit 10] [--cat movies]
```

类别选项: `movies`, `tv`, `music`, `books`, `software`, `anime`

输出 JSON，包含:
- title, size, seeders, leechers
- magnet (磁力链接) 或 link (torrent 下载链接)

### 2. 下载

```bash
# 添加下载
node skills/torrent-downloader/scripts/download.mjs "magnet:?xt=..." [--dir /path]

# 查看状态
node skills/torrent-downloader/scripts/download.mjs --status [gid]

# 列出下载
node skills/torrent-downloader/scripts/download.mjs --list
```

## 典型交互

用户: "帮我找一下 xxx"
1. 执行搜索脚本
2. 展示前几个结果（标题、大小、种子数）
3. 询问要下载哪个
4. 执行下载，返回 GID

用户: "下载进度怎么样"
1. 执行 `--list` 查看活跃下载
2. 汇报进度

## 注意事项

- 优先选择种子数多的资源
- 大文件提醒用户预估时间
- 不要在群聊或其他 session 中暴露此功能
