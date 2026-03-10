import { readFileSync } from 'fs';
import { google } from 'googleapis';

const config = JSON.parse(readFileSync('.config/google/calendar-config.json', 'utf8'));
const credentials = JSON.parse(readFileSync('.config/google/calendar-service-account.json', 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth });

const events = [
  {
    summary: '📚 PCTC 家长会 (Day 1)',
    description: 'Parent-Child-Teacher Conference - 线上进行，孩子不用上学',
    start: { date: '2026-05-28', timeZone: 'Asia/Singapore' },
    end: { date: '2026-05-29', timeZone: 'Asia/Singapore' }
  },
  {
    summary: '📚 PCTC 家长会 (Day 2)',
    description: 'Parent-Child-Teacher Conference - 线上进行，孩子不用上学',
    start: { date: '2026-05-29', timeZone: 'Asia/Singapore' },
    end: { date: '2026-05-30', timeZone: 'Asia/Singapore' }
  }
];

async function addEvents() {
  for (const event of events) {
    try {
      const res = await calendar.events.insert({
        calendarId: config.defaultCalendarId,
        requestBody: event
      });
      console.log(`✅ 已添加: ${event.summary}`);
    } catch (err) {
      console.log(`❌ 失败: ${event.summary} - ${err.message}`);
    }
  }
}

addEvents();
