# Singapore / Asia MTBE 符号与方法论备注

这是 MTBE 相关的整理笔记，避免占用 MEMORY.md。

## 当前确认状态

- **eWindow 无 ASIA MTBE 市场**（已做过全量扫描确认）
- **AAYFG00 不是 MTBE 价格**，其数值长期固定在 -10 / -13 一类，更像 octane 参数
- **AACM 系列**（如 `AACMG00`）存在，但当前无订阅权限
- **EU MTBE (ARA Barges)** 可作为外围参考，但不是新加坡 MTBE assessment 的替代

## 方法论提示

Platts 2025 年后的 MTBE 方法论更接近：
```text
MTBE = 92 RON MOPS Strip + differential
```
并通过 eWindow / market process 形成评估。

## 当前结论

- 新加坡 / 亚洲 MTBE 的**正确 assessment symbol 仍待最终确认**
- 如果以后需要重新追踪，优先从 APAG / Marketscan 或官方方法论文档确认 symbol，不要沿用旧猜测
