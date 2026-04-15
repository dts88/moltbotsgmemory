const fs = require('fs');

function summarizeHeards(heards) {
  const categories = {
    'crude': '原油',
    'products': '成品油',
    'fuelOil': '燃料油',
    'lng': 'LNG'
  };
  const grouped = {};
  heards.forEach(h => {
    if (!grouped[h.category]) grouped[h.category] = [];
    grouped[h.category].push(h);
  });
  let outputLines = [];
  let links = [];
  let counter = 1;
  const order = ['crude', 'products', 'fuelOil', 'lng'];
  order.forEach(cat => {
    if (grouped[cat]) {
      outputLines.push(categories[cat]);
      grouped[cat].forEach(h => {
        let headline = h.headline || '';
        headline = headline.replace(/bids/gi, '买盘').replace(/offers/gi, '卖盘').replace(/trades/gi, '成交');
        outputLines.push(`${headline} [${counter}]`);
        links.push(`[${counter}] ${h.url}`);
        counter++;
      });
      outputLines.push("");
    }
  });
  return { text: outputLines.join('\n'), links: links.join('\n') };
}

function summarizeStories(stories) {
  if (!stories || stories.length === 0) return { text: "", links: "" };
  const grouped = {};
  stories.forEach(s => {
    const comm = (s.commodity && s.commodity[0]) ? s.commodity[0] : 'Other';
    if (!grouped[comm]) grouped[comm] = [];
    grouped[comm].push(s);
  });
  let outputLines = [];
  Object.keys(grouped).forEach(comm => {
    outputLines.push(comm);
    grouped[comm].forEach(s => {
      const headline = s.headline || s.title || '新闻';
      outputLines.push(`${headline} ${s.url}`);
    });
    outputLines.push("");
  });
  return { text: outputLines.join('\n'), links: "" };
}

try {
  const raw = fs.readFileSync('/home/node/clawd/fixed_data.json', 'utf8');
  const data = JSON.parse(raw);
  const hResult = summarizeHeards(data.heards || []);
  const sResult = summarizeStories(data.stories || []);
  let finalMsg = "";
  if (hResult.text) {
    finalMsg += hResult.text;
    if (hResult.links) finalMsg += "---\n" + hResult.links + "\n\n";
  }
  if (sResult.text) finalMsg += sResult.text;
  if (finalMsg.trim()) {
    process.stdout.write(finalMsg.trim());
  } else {
    process.stdout.write("NO_NEW_INSIGHTS");
  }
} catch (e) {
  process.stderr.write(e.message);
}
