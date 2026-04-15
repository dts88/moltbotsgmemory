import fs from 'fs';

const rawContent = fs.readFileSync('monitor_output.json', 'utf8');
const jsonMatch = rawContent.match(/\{[\s\S]*\}/);

if (!jsonMatch) {
  console.error('No JSON found in monitor_output.json');
  process.exit(1);
}

const data = JSON.parse(jsonMatch[0]);
const { heards, stories } = data;

const categoryMap = {
  'crude': '原油',
  'products': '成品油',
  'fuelOil': '燃料油',
  'lng': 'LNG'
};

function translateLine(text) {
  return text
    .replace(/Platts LNG MOC: Intraday values /g, '')
    .replace(/Platts LNG MOC: /g, '')
    .replace(/Intraday values /g, '')
    .replace(/Atlantic LNG Freight: /g, '大西洋LNG运费: ')
    .replace(/\(TTF/g, '(TTF')
    .trim();
}

const groupedHeards = {};
heards.forEach(h => {
  const cat = categoryMap[h.category] || h.category;
  if (!groupedHeards[cat]) groupedHeards[cat] = [];
  groupedHeards[cat].push(h);
});

const groupedStories = {};
stories.forEach(s => {
  const cat = categoryMap[s.category] || s.category;
  if (!groupedStories[cat]) groupedStories[cat] = [];
  groupedStories[cat].push(s);
});

let lines = [];
let links = [];
let linkIndex = 1;

for (const [cat, items] of Object.entries(groupedHeards)) {
  lines.push(`${cat}`);
  items.forEach(item => {
    const text = translateLine(item.headline);
    lines.push(`${text} [${linkIndex}]`);
    links.push(`${linkIndex}. ${item.url}`);
    linkIndex++;
  });
  lines.push('');
}

for (const [cat, items] of Object.entries(groupedStories)) {
  lines.push(`${cat}`);
  items.forEach(item => {
    lines.push(`${item.headline} [${linkIndex}]`);
    links.push(`${linkIndex}. ${item.url}`);
    linkIndex++;
  });
  lines.push('');
}

if (links.length > 0) {
  lines.push('---');
  links.forEach(l => lines.push(l));
}

console.log(lines.join('\n'));
