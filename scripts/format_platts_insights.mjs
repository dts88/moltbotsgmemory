const data = {
  "status": "NEW_INSIGHTS",
  "heards": [
    {
      "id": "33124fc9-8e85-4687-803e-d44bc3725546",
      "category": "products",
      "headline": "Taiwan's CPC seeks at least 35,000 mt of naphtha for May 15-June 30 delivery",
      "body": "Buyer: CPC, Taiwan Specs & quantity: 1) Light naphtha, with a minimum of 70% paraffin and a maximum of 10 parts per million CS2 content; 35,000 metric tons (plus/minus 10% at the seller's option), and/or 2) Full-range naphtha, with a minimum of 50% distillation at 85 degrees C and a maximum of 10 ppm CS2 content; 35,000 mt (plus/minus 10% at the seller's option) and/or 3) Heavy naphtha; 35,000 mt (plus/minus 10% at the seller's option) Port: Kaohsiung, Taiwan When: Delivery over May 15-June 30 Basis: The May average of Mean of Platts Japan naphtha assessments, CFR Close: April 14, with validity until April 15 Data from: Tender document Notes: The company previously sought at least 35,000 mt of full-range or heavy naphtha for delivery over May 1-30 via a tender that closed March 30, with validity expiring March 31, Platts, part of S&P Global Energy, reported March 30.",
      "time": "2026-04-15T00:50:42Z",
      "url": "https://plattsconnect.spglobal.com/#platts/source?sourceId=33124fc9-8e85-4687-803e-d44bc3725546"
    }
  ],
  "stories": [
    {
      "id": "4cc9ebe2-5e0c-4ce9-9404-23340d515d2a",
      "headline": "Japan PM to pledge $10 bil financial support, credit lines for crude oil at AZEC summit",
      "summary": "Credit lines to support short-term crude oil procurement Move to help build oil reserves, promote energy diversification",
      "body": "Japanese Prime Minister Sanae Takaichi is set to pledge $10 billion in financial support April 15, along with a series of steps aimed at bolstering energy security in Southeast Asia amid supply disruptions stemming from the war in the Middle East, a Japanese government source told Platts, part of S&P Global Energy. The Japanese prime minister's pledge will be made during an online special summit meeting of the Asia Zero Emission Community, scheduled for 3 pm local time (0600 GMT), according to the source. Japan's support measures will include providing credit lines for short-term crude oil procurement, helping countries in the region develop petroleum reserves and diversifying energy sources in the mid to long term, the source said. \"To be precise, in the short term, we will make it possible to provide credit lines needed for crude oil procurement,\" the source said. \"We will also support the establishment of stockpiling systems and energy diversification in the medium to long term.\" This comes at a time when the Middle East conflict has affected oil supplies to some members of the 11-nation AZEC partner countries of Australia, Brunei Darussalam, Cambodia, Indonesia, Japan, Lao PDR, Malaysia, the Philippines, Singapore, Thailand and Vietnam.",
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
  return categoryMap[cat] || cat;
}

let output = "";
let links = [];
let linkIndex = 1;

// Process Heards
const heardsByCat = {};
data.heards.forEach(h => {
  const cat = translateCategory(h.category);
  if (!heardsByCat[cat]) heardsByCat[cat] = [];
  heardsByCat[cat].push(h);
});

for (const cat in heardsByCat) {
  output += `${cat}\n`;
  heardsByCat[cat].forEach(h => {
    // Simple summary for heards: Headline
    output += `${h.headline} [${linkIndex}]\n`;
    links.push(`[${linkIndex}] ${h.url}`);
    linkIndex++;
  });
}

if (output.trim() !== "") output += "\n";

// Process Stories
const storiesByCat = {};
data.stories.forEach(s => {
  // Group stories by their first commodity
  const cat = s.commodity ? translateCategory(s.commodity[0].toLowerCase()) : '其他';
  if (!storiesByCat[cat]) storiesByCat[cat] = [];
  storiesByCat[cat].push(s);
});

for (const cat in storiesByCat) {
  output += `${cat}\n`;
  storiesByCat[cat].forEach(s => {
    output += `${s.headline} [${linkIndex}]\n`;
    links.push(`[${linkIndex}] ${s.url}`);
    linkIndex++;
  });
}

if (links.length > 0) {
  output += "\n---\n" + links.join("\n");
}

console.log(output);
