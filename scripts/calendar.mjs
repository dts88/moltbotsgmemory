#!/usr/bin/env node
/**
 * Google Calendar 集成脚本
 * 使用 Service Account + 日历共享
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_PATH = join(__dirname, '../.config/google/calendar-service-account.json');
const CONFIG_PATH = join(__dirname, '../.config/google/calendar-config.json');

// 获取默认日历 ID
function getDefaultCalendarId() {
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    return config.defaultCalendarId;
  } catch {
    return null;
  }
}

// 初始化认证
function getAuth() {
  const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
  return new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'https://www.googleapis.com/auth/calendar.events'],
  });
}

// 列出可访问的日历
async function listCalendars() {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  
  const res = await calendar.calendarList.list();
  return res.data.items || [];
}

// 获取日程 (默认今天)
async function getEvents(calendarId, options = {}) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  
  const now = new Date();
  const timeMin = options.timeMin || new Date(now.setHours(0, 0, 0, 0)).toISOString();
  const timeMax = options.timeMax || new Date(now.setHours(23, 59, 59, 999)).toISOString();
  
  const res = await calendar.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: options.maxResults || 50,
  });
  
  return res.data.items || [];
}

// 获取未来 N 天的日程
async function getUpcomingEvents(calendarId, days = 7) {
  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  
  return getEvents(calendarId, { timeMin, timeMax });
}

// 创建事件
async function createEvent(calendarId, event) {
  const auth = getAuth();
  const calendar = google.calendar({ version: 'v3', auth });
  
  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });
  
  return res.data;
}

// 格式化事件为可读文本
function formatEvent(event, includeDate = false) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const startDate = new Date(start);
  
  let dateStr = '';
  if (includeDate) {
    const month = startDate.getMonth() + 1;
    const day = startDate.getDate();
    const weekday = ['日', '一', '二', '三', '四', '五', '六'][startDate.getDay()];
    dateStr = `${month}/${day}(${weekday}) `;
  }
  
  let timeStr = '';
  if (event.start?.dateTime) {
    const startTime = startDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' });
    const endTime = new Date(end).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Singapore' });
    timeStr = `${startTime}-${endTime}`;
  } else {
    timeStr = '全天';
  }
  
  return `${dateStr}${timeStr} | ${event.summary || '(无标题)'}${event.location ? ` @ ${event.location}` : ''}`;
}

// 格式化事件列表
function formatEvents(events, title = '日程', includeDate = false) {
  if (!events.length) return `${title}: 无`;
  
  const lines = events.map(e => formatEvent(e, includeDate));
  return `${title}:\n${lines.join('\n')}`;
}

// CLI
async function main() {
  const [,, command, ...args] = process.argv;
  
  try {
    switch (command) {
      case 'calendars':
      case 'list': {
        const calendars = await listCalendars();
        if (!calendars.length) {
          console.log('未找到可访问的日历。请确保已将日历共享给 Service Account。');
          console.log('Service Account 邮箱: saopenclaw@dtsdts.iam.gserviceaccount.com');
        } else {
          console.log('可访问的日历:');
          calendars.forEach(c => console.log(`  - ${c.summary} (${c.id})`));
        }
        break;
      }
      
      case 'today': {
        const calendarId = args[0] || getDefaultCalendarId() || 'primary';
        const events = await getEvents(calendarId);
        console.log(formatEvents(events, '今日日程'));
        break;
      }
      
      case 'upcoming':
      case 'week': {
        const calendarId = args[0] || getDefaultCalendarId() || 'primary';
        const days = parseInt(args[1]) || 7;
        const events = await getUpcomingEvents(calendarId, days);
        console.log(formatEvents(events, `未来 ${days} 天日程`, true));
        break;
      }
      
      case 'add': {
        const calendarId = args[0];
        const summary = args[1];
        const startTime = args[2];
        const endTime = args[3];
        
        if (!calendarId || !summary || !startTime) {
          console.log('用法: calendar.mjs add <calendarId> <标题> <开始时间> [结束时间]');
          console.log('时间格式: 2026-02-08T10:00:00+08:00');
          process.exit(1);
        }
        
        const event = {
          summary,
          start: { dateTime: startTime, timeZone: 'Asia/Singapore' },
          end: { dateTime: endTime || new Date(new Date(startTime).getTime() + 3600000).toISOString(), timeZone: 'Asia/Singapore' },
        };
        
        const created = await createEvent(calendarId, event);
        console.log(`已创建事件: ${created.summary}`);
        console.log(`链接: ${created.htmlLink}`);
        break;
      }
      
      default:
        console.log('Google Calendar 工具');
        console.log('');
        console.log('用法:');
        console.log('  calendar.mjs calendars          列出可访问的日历');
        console.log('  calendar.mjs today [id]         今日日程');
        console.log('  calendar.mjs week [id] [days]   未来 N 天日程');
        console.log('  calendar.mjs add <id> <title> <start> [end]  创建事件');
    }
  } catch (err) {
    console.error('错误:', err.message);
    if (err.message.includes('Not Found')) {
      console.error('提示: 请确保日历已共享给 saopenclaw@dtsdts.iam.gserviceaccount.com');
    }
    process.exit(1);
  }
}

// 导出供其他脚本使用
export { listCalendars, getEvents, getUpcomingEvents, createEvent, formatEvents, formatEvent };

main();
