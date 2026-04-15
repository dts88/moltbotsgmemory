# ICE Report Center - 登录与下载

## 触发词
ICE报告、ICE Brent下载、ice.com下载、ICE日报、下载ICE结算价

## 账号信息
- **用户名**: `dai.tianshu@rong-sheng.com`
- **密码**: `018982rs!`
- **appKey**: `ICE`（注意：不是 `ICEDOWNLOADS`，账号没有该权限）
- **2FA**: 邮件验证码，发到同一邮箱，有效期约 30 秒

## Session 缓存
- **文件**: `.config/ice/session.json`
- **有效期**: ~8 小时
- **字段**: `iceSsoCookie`, `iceSsoJSessionId`, `timestamp`

## 登录流程（4步）

```
① GET  https://sso.ice.com/appUserLogin?loginApp=ICE
   → 获取 iceSsoJSessionId cookie

② POST https://sso.ice.com/api/authenticateTfa
   Headers: Content-Type: application/json, X-Requested-With: XMLHttpRequest
   Cookie: iceSsoJSessionId=<上一步>
   Body: {"userId":"dai.tianshu@rong-sheng.com","password":"018982rs!","appKey":"ICE","permissions":"ICE"}
   → 返回 code: -32100，邮件发送验证码

③ POST https://sso.ice.com/api/authenticateTfa  (加 otpCode)
   Body: 同上 + "otpCode":"<6位验证码>"
   → Set-Cookie: iceSsoCookie=tidai_gid.GLOBAL.xxxx  ← 关键！
   → Set-Cookie: iceSsoJSessionId=<新值>

④ GET  https://www.ice.com/marketdata/api/reports/10/criteria
   Cookie: iceSsoCookie=<上一步>; iceSsoJSessionId=<上一步>
   → Set-Cookie: reportCenterCookie=<uuid>  ← 第三个 cookie
```

## 下载 API

```
POST https://www.ice.com/marketdata/api/reports/10/download/pdf
Headers:
  Content-Type: application/x-www-form-urlencoded
  Referer: https://www.ice.com/report/10
  Cookie: iceSsoCookie=<>;  iceSsoJSessionId=<>; reportCenterCookie=<>
Body (form-encoded):
  exchangeCodeAndContract=IFEU,B
  selectedDate=YYYY-MM-DD
→ 返回 PDF 二进制（application/pdf）
```

## 其他有用端点

```
# 查询可用报告日期列表
POST https://www.ice.com/marketdata/api/reports/10/results
Body: exchangeCodeAndContract=IFEU%2CB
→ 返回 JSON，含 datasets.contractDates.rows[].reportDate

# 报告元数据
GET https://www.ice.com/marketdata/api/reports/metadata/10
→ {"id":10,"name":"End of Day Report - ICE Futures Europe - Futures",...}
```

## 报告 ID 对照
| Report ID | 名称 |
|-----------|------|
| 10 | End of Day Report - ICE Futures Europe - Futures (Brent 等) |

## 合约代码
| 合约 | exchangeCodeAndContract |
|------|------------------------|
| B-Brent Crude Future | `IFEU,B` |

## 主脚本
- **下载+解析+发送**: `scripts/ice-brent-report.mjs`
- **Cron ID**: `9ddf0631-1725-4af9-93cb-8a4c911a815a`（每天 04:30 SGT，周一至周五）

## ⚠️ 注意事项
1. `downloads.ice.com` 需要 `ICEDOWNLOADS` 权限，该账号**没有**，不要用
2. 2FA 验证码有效期约 30 秒，要快速提交
3. `iceSsoCookie` 格式: `tidai_gid.GLOBAL.YYYY_MM_DD.HH_MM_SS_xxx.xxx`
4. Session 过期后需要重新走完整登录流程（含 2FA）
5. `reportCenterCookie` 每次访问 criteria API 都会重新颁发，无需缓存
