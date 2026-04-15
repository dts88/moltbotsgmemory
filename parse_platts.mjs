const fs = require('fs');

try {
  const content = fs.readFileSync('/home/node/clawd/platts_output.txt', 'utf8');
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log("No JSON found");
    process.exit(1);
  }
  const data = JSON.parse(jsonMatch[0]);
  const heards = data.heards || [];
  const stories = data.stories || [];

  const categories = {
    'crude': '原油',
    'products': '成品油',
    'fuelOil': '燃料油',
    'lng': 'LNG'
  };

  let output = "";

  // 1. Group Heards
  const groupedHeards = {};
  heards.forEach(h => {
    if (!groupedHeards[h.category]) groupedHeards[h.category] = [];
    groupedHeards[h.category].push(h);
  });

  const order = ['crude', 'products', 'fuelOil', 'lng'];
  let heardCounter = 1;
  const linkMap = new Map();

  for (const cat of order) {
    if (groupedHeards[cat]) {
      output += categories[cat] + "\n";
      groupedHeards[cat].forEach(h => {
        // Simplified summary for heards to fit context: headline
        output += `${h.headline} [${heardCounter}]\n`;
        linkMap.set(heardCounter, h.url);
        heardCounter++;
      });
      output += "\n";
    }
  }

  // 2. Group Stories
  const groupedStories = {};
  stories.forEach(s => {
    const cat = s.commodity && s.commodity[0] ? s.commodity[0].toLowerCase() : 'other';
    // Mapping product names to main categories if needed
    let mainCat = 'products';
    if (cat === 'naphtha' || cat === 'gasoline' || cat === 'diesel' || cat === 'jet' || cat === 'gasoil') mainCat = 'products';
    else if (cat === 'crude') mainCat = 'crude';
    else if (cat === 'lng') mainCat = 'lng';
    else if (cat === 'fuel oil') mainCat = 'fuelOil';
    
    if (!groupedStories[mainCat]) groupedStories[mainCat] = [];
    groupedStories[mainCat].push(s);
  });

  // For stories, the user asked: "Stories 按品种分组，每条附链接"
  // But the instruction #1 and #2 are under "Heards". 
  // Instruction #3: "Stories 按品种分组，每条附链接"
  // The user instruction for Stories is a bit different from Heards.
  // Let's follow the specific instruction for Stories: "按品种分组，每条附链接"
  
  for (const [cat, items] of Object.entries(groupedStories)) {
    output += categories[cat] || cat + "\n";
    items.forEach(s => {
      // We'll use a simple summary or headline for stories
      // Since stories are usually longer, we just take the first line or headline
      const summary = s.headline || s.title || "新闻详情";
      output += `${summary} ${s.url}\n`;
    });
    output += "\n";
  }

  // Wait, the user instruction says:
  // 1. 解析 JSON 中的 heards 和 stories
  // 2. Heards 按品种分组...合并成一条消息
  // 3. Stories 按品种分组，每条附链接
  // 4. 用中文总结，纯文本格式（不用**加粗）
  // 5. 用 message 工具发送...
  
  // Let's re-read the "instructions" inside the JSON. It's a prompt for an LLM.
  // The user wants ME to do the parsing and summarizing.
  // The JSON output of the monitor IS the source.
  // The output I see is NEW_INSIGHTS + JSON.

  // Let's try to just print the formatted text for the user or for me to see.
  // Actually, I will write a script that extracts the data so I can then 
  // use my reasoning to "summarize in Chinese" as requested.
  
  // The instruction in the prompt says: "用中文总结". 
  // So I shouldn't just dump the English headlines. I should summarize them.
  // I will output the raw data in a way I can process.

  console.log(JSON.stringify({heards, stories}));

} catch (e) {
  console.error(e);
}
