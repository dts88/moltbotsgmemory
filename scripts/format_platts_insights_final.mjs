const data = {
  "status": "NEW_INSIGHTS",
  "heards": [
    {
      "id": "33124fc9-8e85-4687-803e-d44bc3725546",
      "category": "products",
      "headline": "Taiwan's CPC seeks at least 35,000 mt of naphtha for May 15-June 30 delivery",
      "body": "...",
      "time": "2026-04-15T00:50:42Z",
      "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=33124fc9-8e85-4687-803e-d44bc3725546"
    }
  ],
  "stories": [
    {
      "id": "4cc9ebe2-5e0c-4ce9-9404-23340d515d2a",
      "headline": "Japan PM to pledge $10 bil financial support, credit lines for crude oil at AZEC summit",
      "summary": "...",
      "body": "...",
      "time": "2026-04-15T01:12:11Z",
      "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=4cc9ebe2-5e0c-4ce9-9404-23340d515d2a",
      "commodity": ["Crude oil", "Refined products"]
    }
  ]
};

const categoryMap = {
  'crude': '原油',
  'products': '成品油',
  'fuelOil': '燃料油',
  'lng': 'LNG'
};

function translateCategory(cat) {
  const lower = cat.toLowerCase();
  if (lower.includes('crude')) return '原油';
  if (lower.includes('product')) return '成品油';
  if (lower.includes('fuel')) return '燃料油';
  if (lower.includes('lng')) return 'LNG';
  return cat;
}

let output = "";
let links = [];
let linkIndex = 1;

// 1. Heards
const heardsByCat = {};
data.heards.forEach(h => {
  const cat = translateCategory(h.category);
  if (!heardsByCat[cat]) heardsByCat[cat] = [];
  heardsByCat[cat].push(h);
});

for (const cat in heardsByCat) {
  output += `${cat}\n`;
  heardsByCat[cat].forEach(h => {
    // For heards, we use a concise version of headline/body context
    // Since the user wants "Chinese summary", we'll manually translate/summarize the content here
    // In a real scenario, I'd use the LLM capabilities, but here I'm a script.
    // I will perform the "summary" via the prompt's intent.
    // Since this is a script, I'll output the headline as the base.
    output += `台湾CPC寻求至少35,000公吨石脑油，交货期5/15-6/30 [${linkIndex}]\n`;
    links.push(`[${linkIndex}] ${h.url}`);
    linkIndex++;
  });
}

if (output.trim() !== "") output += "\n";

// 2. Stories
const storiesByCat = {};
data.stories.forEach(s => {
  const cat = s.commodity ? translateCategory(s.commodity[0]) : '其他';
  if (!storiesByCat[cat]) storiesByCat[cat] = [];
  storiesByCat[cat].push(s);
});

for (const cat in storiesByCat) {
  output += `${cat}\n`;
  storiesByCat[cat].forEach(s => {
    output += `日本首相将在AZEC峰会上承诺提供100亿美元金融支持及原油信贷额度 [${linkIndex}]\n`;
    links.push(`[${linkIndex}] ${s.url}`);
    linkIndex++;
  });
}

if (links.length > 0) {
  output += "\n---\n" + links.join("\n");
}

console.log(output);
