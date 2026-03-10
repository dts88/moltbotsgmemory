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
    summary: '🏛️ 4T 博物馆学习 - National Gallery',
    description: 'Museum-Based Learning at National Gallery Singapore\n时间: 2:00 PM - 5:30 PM',
    start: { dateTime: '2026-04-10T14:00:00', timeZone: 'Asia/Singapore' },
    end: { dateTime: '2026-04-10T17:30:00', timeZone: 'Asia/Singapore' },
    location: 'National Gallery Singapore'
  },
  {
    summary: '🏊 4T Swimsafer 游泳课 (Term 2)',
    description: 'Swimsafer Programme - 8节课，每节1.5小时\n地点: Our Tampines Hub\n每周三进行',
    start: { date: '2026-03-23', timeZone: 'Asia/Singapore' },
    end: { date: '2026-05-15', timeZone: 'Asia/Singapore' }
  },
  {
    summary: '🏃 NAPFA 体测 (Term 3 Week 4-5)',
    description: 'National Annual Physical Fitness Assessment\n具体日期学校会另行通知',
    start: { date: '2026-07-20', timeZone: 'Asia/Singapore' },
    end: { date: '2026-07-31', timeZone: 'Asia/Singapore' }
  }
];

async function addEvents() {
  for (const event of events) {
    try {
      const res = await calendar.events.insert({
        calendarId: config.defaultCalendarId,
        requestBody: event
      });
      console.log(`✅ ${event.summary}`);
    } catch (err) {
      console.log(`❌ ${event.summary} - ${err.message}`);
    }
  }
}

addEvents();
