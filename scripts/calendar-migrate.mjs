import { readFileSync, writeFileSync } from 'fs';
import { google } from 'googleapis';

const credentials = JSON.parse(readFileSync('.config/google/calendar-service-account.json', 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth });

const MAIN_CALENDAR = 'dtsdts@gmail.com';
const MOLTBOT_CALENDAR = '656a2df92a0ff72f17d5376c7d0359071602c362746659991ed378e38413f4dc@group.calendar.google.com';

async function testAndMigrate() {
  // 1. Test main calendar access
  console.log('=== 测试主日历访问 ===');
  try {
    const mainCal = await calendar.calendars.get({ calendarId: MAIN_CALENDAR });
    console.log('✅ 主日历访问成功:', mainCal.data.summary);
  } catch (err) {
    console.log('❌ 主日历访问失败:', err.message);
    console.log('\n需要检查授权设置');
    return;
  }
  
  // 2. List Moltbot calendar events
  console.log('\n=== 列出 Moltbot 日历事件 ===');
  let moltbotEvents = [];
  try {
    const events = await calendar.events.list({
      calendarId: MOLTBOT_CALENDAR,
      maxResults: 100,
      singleEvents: true,
      orderBy: 'startTime',
      timeMin: new Date('2026-01-01').toISOString()
    });
    
    moltbotEvents = events.data.items || [];
    console.log(`找到 ${moltbotEvents.length} 个事件:`);
    for (const event of moltbotEvents) {
      const start = event.start?.dateTime || event.start?.date;
      console.log(`  - ${start}: ${event.summary}`);
    }
  } catch (err) {
    console.log('❌ Moltbot日历访问失败:', err.message);
    return;
  }
  
  if (moltbotEvents.length === 0) {
    console.log('\n没有需要迁移的事件');
    return;
  }
  
  // 3. Migrate events to main calendar
  console.log('\n=== 迁移事件到主日历 ===');
  const migrated = [];
  for (const event of moltbotEvents) {
    try {
      // Create new event in main calendar
      const newEvent = {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        reminders: event.reminders
      };
      
      const created = await calendar.events.insert({
        calendarId: MAIN_CALENDAR,
        requestBody: newEvent
      });
      
      console.log(`✅ 已迁移: ${event.summary}`);
      migrated.push({ oldId: event.id, newId: created.data.id, summary: event.summary });
    } catch (err) {
      console.log(`❌ 迁移失败: ${event.summary} - ${err.message}`);
    }
  }
  
  // 4. Delete from Moltbot calendar
  console.log('\n=== 删除 Moltbot 日历中的原事件 ===');
  for (const m of migrated) {
    try {
      await calendar.events.delete({
        calendarId: MOLTBOT_CALENDAR,
        eventId: m.oldId
      });
      console.log(`🗑️ 已删除: ${m.summary}`);
    } catch (err) {
      console.log(`❌ 删除失败: ${m.summary} - ${err.message}`);
    }
  }
  
  // 5. Update config
  console.log('\n=== 更新配置 ===');
  const config = {
    defaultCalendarId: MAIN_CALENDAR,
    timezone: 'Asia/Singapore'
  };
  writeFileSync('.config/google/calendar-config.json', JSON.stringify(config, null, 2));
  console.log('✅ 配置已更新为主日历');
  
  console.log(`\n✅ 迁移完成: ${migrated.length} 个事件`);
}

testAndMigrate();
