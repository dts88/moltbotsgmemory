---
name: "jin10-mcp"
description: "调用金十数据 MCP 财经数据服务（行情/快讯/资讯/日历）"
---

# 金十数据 MCP 使用指南

金十数据 MCP 通过标准 MCP streamable-http 协议接入，提供财经行情、快讯、资讯、日历等数据。

## 入口

配置已保存在 `openclaw.json` 的 `mcp.servers.jin10`。工具名自动带 `jin10__` 前缀。

## 验证

```bash
openclaw mcp doctor jin10 --probe
openclaw mcp probe jin10
```

## 工具列表

### 行情类

| 工具 | 参数 | 说明 |
|------|------|------|
| `jin10__get_quote` | `code: string` | 获取实时报价 |
| `jin10__get_kline` | `code: string`, `time?: int(秒)`, `count?: int(1-100)` | 分钟K线(默认近100根) |

### 快讯类

| 工具 | 参数 | 说明 |
|------|------|------|
| `jin10__list_flash` | `cursor?: string` | 最新快讯列表(可翻页) |
| `jin10__search_flash` | `keyword: string` | 按关键词搜索快讯 |

### 资讯类

| 工具 | 参数 | 说明 |
|------|------|------|
| `jin10__list_news` | `cursor?: string` | 最新资讯列表(可翻页) |
| `jin10__search_news` | `keyword: string`, `cursor?: string` | 搜索资讯(可翻页) |
| `jin10__get_news` | `id: string` | 获取单篇正文 |

### 日历类

| 工具 | 参数 | 说明 |
|------|------|------|
| `jin10__list_calendar` | (无) | 本周财经日历 |

### 资源类

| 工具 | 说明 |
|------|------|
| `jin10__resources_list` | 列出可用资源 |
| `jin10__resources_read` | 读取资源内容 |

## 数据字段约定

### 报价 (`get_quote`)
```json
{
  "data": {
    "code": "XAUUSD",
    "name": "现货黄金",
    "time": 1704067200,
    "open": 2050.12,
    "close": 2065.34,
    "high": 2075.50,
    "low": 2048.20,
    "volume": 123456,
    "ups_price": 15.22,
    "ups_percent": 0.74
  }
}
```

### K线 (`get_kline`)
```json
{
  "data": {
    "code": "XAUUSD",
    "name": "现货黄金",
    "klines": [
      { "close": 2065.34, "high": 2070.1, "low": 2063.2, "open": 2065.0, "time": 1704067200, "volume": 1234 }
    ]
  }
}
```

### 快讯/资讯列表
```json
{
  "data": {
    "items": [...],
    "next_cursor": "xxxx",
    "has_more": true
  }
}
```

### 文章详情 (`get_news`)
```json
{
  "data": {
    "id": "xxx",
    "title": "标题",
    "introduction": "简介",
    "time": 1704067200,
    "url": "https://...",
    "content": "正文..."
  }
}
```

### 日历 (`list_calendar`)
```json
{
  "data": [
    {
      "pub_time": "2026-07-01 20:30",
      "star": 3,
      "title": "美国初请失业金人数",
      "previous": "23.3",
      "consensus": "23.0",
      "actual": "22.8",
      "revised": "",
      "affect_txt": "利好美元"
    }
  ]
}
```

## 常用品种 Code

| Code | 品种 |
|------|------|
| XAUUSD | 现货黄金 |
| XAGUSD | 现货白银 |
| USOIL | WTI原油 |
| UKOIL | 布伦特原油 |
| COPPER | 现货铜 |
| USDJPY | 美元/日元 |
| EURUSD | 欧元/美元 |
| USDCNH | 美元/人民币 |

## 推荐调用模式

### 问报价 / K线
1. 可选：调 `jin10__resources_read({ uri: "quote://codes" })` 确认 code
2. 调 `jin10__get_quote({ code })` 或 `jin10__get_kline({ code, time?, count? })`

### 问快讯
- 搜索：`jin10__search_flash({ keyword })`
- 浏览最新：`jin10__list_flash({})` → 用 `data.next_cursor` 翻页

### 问深度文章
- 搜索：`jin10__search_news({ keyword })` → 拿 id
- 正文：`jin10__get_news({ id })`

### 问日历
- 直接：`jin10__list_calendar({})`

## 分页约定

- 请求：`cursor` 字段
- 响应：`data.next_cursor` + `data.has_more`

## 错误处理

- `isError=true` → 工具业务错误（如 code 不存在）
- JSON-RPC `error` → 协议错误（超时、认证等）
- 不传未声明的参数（如不要传 `offset` 分页）

## 关键词示例

黄金、原油、美联储、日元、通胀、非农、日本央行、欧佩克
