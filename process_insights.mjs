const data = {
  "status": "NEW_INSIGHTS",
  "heards": [
    {"category": "products", "headline": "Platts Distillates: Diesel cargoes DAP Santos heard talked (MR full cargo) at NYMEX June ULSD futures +42 cents/gal, USG", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=e9f07af8-de90-46e7-becb-370ca97a2218"},
    {"category": "products", "headline": "Platts Distillates: Diesel cargoes DAP Santos heard talked (MR full cargo) at NYMEX June ULSD futures +24.5 cents/gal, U", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=0bd6f9f5-f020-4426-a217-c4294ce20a7c"},
    {"category": "products", "headline": "USWC Gasoline: 5.99 RVP: April Los Angeles regular CARBOB heard done at NYMEX May RBOB futures +46.00 cpg (heard after 1", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=332b1d77-a1b9-4707-8706-b1b16a913986"},
    {"category": "products", "headline": "Brazil Gasoline: Prompt FCA Itaqui heard offered at Petrobras ETM São Luís +R$850/cu m", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=50bd13b9-7145-45d0-8f6f-b701003c5a65"},
    {"category": "fuelOil", "headline": "Latin Bunkers: 0.5%S marine fuel heard talked at $796/mt delivered Paranagua, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=26d5f806-cb4f-4e39-abbe-08193f690535"},
    {"category": "fuelOil", "headline": "Latin Bunkers: 0.5%S marine fuel heard talked at $749/mt ex-Pipe Fortaleza, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=f1754a7a-dbc4-4f4e-a65b-ed9d8faf4699"},
    {"category": "fuelOil", "headline": "Latin Bunkers: MGO heard talked at $1511/mt delivered Belem, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=1d07d285-b3e3-42d6-8952-5740c179c6e8"},
    {"category": "fuelOil", "headline": "Latin Bunkers: MGO 0.1% heard talked at $1512/mt delivered Rio Grande, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=b3896d57-bb38-42e4-9bc7-6a34d8550e23"},
    {"category": "fuelOil", "headline": "Latin Bunkers: 0.5%S marine fuel heard talked at $786/mt delivered Rio Grande, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=86b20397-7b8b-4bf5-85e7-099d3bcf7fde"},
    {"category": "fuelOil", "headline": "Latin Bunkers: MGO heard talked at $1509/mt delivered Santos, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=f83acc22-d762-4348-8b78-b54a240c0f6b"},
    {"category": "fuelOil", "headline": "Latin Bunkers: 0.5%S marine fuel heard talked at $721/mt delivered Santos, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=e49989e8-0d5a-4c8b-8fff-2079f3775f93"},
    {"category": "fuelOil", "headline": "LatIn Bunkers: MGO 0.1% heard talked at $1559/mt delivered Rio de Janeiro, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=2e9606c4-224b-4143-9977-0e90d93e75a5"},
    {"category": "fuelOil", "headline": "Latin Bunkers: MGO 0.1% heard talked at $1522/mt ex-Pipe Fortaleza, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=d0101f64-13ce-4512-aacb-a3818445744a"},
    {"category": "fuelOil", "headline": "Latin Bunkers: 0.5%S marine fuel heard talked at $771/mt delivered Rio de Janeiro, heard before 1:30 pm CST", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=058638bb-7af4-45ca-8031-b4b99302944e"},
    {"category": "products", "headline": "Platts US Gulf Coast Gasoline Bids, Offers and Trades", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=fb09e7ab-ce18-4585-a7b8-7943db5d34d1"}
  ],
  "stories": [
    {"headline": "Atlantic LNG prices soften as possible Iran peace talks lift sentiment", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=91bfe143-ca8e-4c14-9a3c-1b2af116bbc2", "commodity": ["LNG", "Natural gas"]},
    {"headline": "Platts Atlantic and Pacific LNG Freight Daily Commentary", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=c6fb3dcc-d73e-4667-81f0-84dc2fd526e1", "commodity": ["Shipping", "LNG", "Natural gas"]},
    {"headline": "Platts North Sea Crude Daily Market Analysis", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=1789cb3d-bb11-43bb-afc1-2ea383beb5f3", "commodity": ["Crude oil", "WTI Midland crude"]},
    {"headline": "Platts European Gasoil Daily Market Analysis", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=18bbd650-9c2d-4af0-a50f-02a6d95612b2", "commodity": ["Gasoil", "Diesel fuel"]},
    {"headline": "Platts European Jet Daily Market Analysis", "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=772db885-9a20-46e8-9f2f-4d059c622ee6", "commodity": ["Jet fuel", "Brent crude"]}
  ]
};

const categoryMap = {
  "products": "成品油",
  "fuelOil": "燃料油",
  "crude": "原油",
  "lng": "LNG"
};

const commodityMap = {
  "LNG": "LNG",
  "Crude oil": "原油",
  "Gasoil": "成品油",
  "Jet fuel": "成品油"
};

function getCategory(item, isStory = false) {
  if (isStory) {
    const comm = item.commodity[0];
    return commodityMap[comm] || "其他";
  }
  return categoryMap[item.category] || "其他";
}

let heardsGrouped = {};
data.heards.forEach(h => {
  const cat = getCategory(h);
  if (!heardsGrouped[cat]) heardsGrouped[cat] = [];
  heardsGrouped[cat].push(h);
});

let storiesGrouped = {};
data.stories.forEach(s => {
  const cat = getCategory(s, true);
  if (!storiesGrouped[cat]) storiesGrouped[cat] = [];
  storiesGrouped[cat].push(s);
});

let lines = [];
let urls = [];
let urlCounter = 1;

// 1. Heards
const sortedHeardCats = Object.keys(heardsGrouped).sort();
for (const cat of sortedHeardCats) {
  lines.push(cat + ":");
  for (const h of heardsGrouped[cat]) {
    lines.push(`${h.headline} [${urlCounter}]`);
    urls.push({id: urlCounter, url: h.url});
    urlCounter++;
  }
}

lines.push("");

// 2. Stories
const sortedStoryCats = Object.keys(storiesGrouped).sort();
for (const cat of sortedStoryCats) {
  lines.push(cat + ":");
  for (const s of storiesGrouped[cat]) {
    lines.push(`${s.headline} [${urlCounter}]`);
    urls.push({id: urlCounter, url: s.url});
    urlCounter++;
  }
}

lines.push("");
lines.push("---");
urls.forEach(u => {
  lines.push(`[${u.id}] ${u.url}`);
});

console.log(lines.join("\n"));
