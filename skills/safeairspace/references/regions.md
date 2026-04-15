# Safe Airspace 地区分组

## 支持的 --region 值

| 值 | 覆盖国家 |
|----|---------|
| `mideast` | Iran, Iraq, Israel, Lebanon, Syria, Yemen, Saudi Arabia, UAE, Qatar, Bahrain, Kuwait, Oman, Jordan, Egypt, Palestine, Gaza, Armenia, Azerbaijan |
| `caucasus` | Armenia, Azerbaijan, Georgia |
| `africa` | Libya, Sudan, South Sudan, Mali, Somalia, Ethiopia, Congo DRC, Rwanda |
| `europe` | Ukraine, Russia, Belarus, Moldova |
| `asia` | Afghanistan, Pakistan, Myanmar, North Korea |

## 风险等级与 emoji 对应

| Emoji | 级别 | 关键词 |
|-------|------|--------|
| 🚫 | PROHIBITED | do not fly, prohibited |
| ⛔ | AVOID | should not enter, not enter, closed |
| ⚠️ | AVOID | avoid |
| ⚡ | CAUTION | caution, advisory |
| 📋 | NOTICE | 其他 |

## 数据说明

- 来源: safeairspace.net（Conflict Zone and Risk Database）
- 内容: 各国政府/EASA/FAA 发布的航空 NOTAM、AIC、CZIB 警告
- 更新: 近实时（网页抓取）
- 不含: ATC 实时状态、METAR、SIGMET 气象信息

## 已知局限

- 日期只有日/月，无年份（自动推断为当年）
- 跨年数据（如上年12月）有时会被误判为今年
- safeairspace.net 仅覆盖冲突/战争风险，不含常规禁飞区（如核电站等）
