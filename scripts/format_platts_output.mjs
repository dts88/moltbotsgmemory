const fs = require('fs');

async function processOutput() {
    try {
        const rawData = fs.readFileSync('/home/node/clawd/platts_raw_output.json', 'utf8');
        const data = JSON.parse(rawData);

        if (data.status !== 'NEW_INSIGHTS') return;

        const heards = data.heards || [];
        const stories = data.stories || [];

        const groups = {
            'crude': [],
            'products': [],
            'fuelOil': [],
            'lng': []
        };

        // Process Heards
        heards.forEach((h, index) => {
            const cat = h.category;
            if (groups[cat]) {
                groups[cat].push(`${h.headline} [${index + 1}]`);
            } else {
                groups['products'].push(`${h.headline} [${index + 1}]`);
            }
        });

        // Process Stories
        const storyGroups = {
            'crude': [],
            'products': [],
            'fuelOil': [],
            'lng': []
        };

        stories.forEach((s, index) => {
            let cat = 'products';
            if (s.commodity && s.commodity.length > 0) {
                const comm = s.commodity[0].toLowerCase();
                if (comm.includes('crude')) cat = 'crude';
                else if (comm.includes('diesel') || comm.includes('gasoil') || comm.includes('jet') || comm.includes('gasoline')) cat = 'products';
                else if (comm.includes('fuel oil')) cat = 'fuelOil';
            }
            
            const linkIdx = index + 1 + heards.length;
            storyGroups[cat].push(`${s.headline} [${linkIdx}]`);
        });

        let output = "";
        const catMap = { 'crude': '原油', 'products': '成品油', 'fuelOil': '燃料油', 'lng': 'LNG' };
        
        for (const [key, label] of Object.entries(catMap)) {
            const items = groups[key];
            if (items.length > 0) {
                output += `${label}\n${items.join('\n')}\n\n`;
            }
        }

        for (const [key, label] of Object.entries(catMap)) {
            const items = storyGroups[key];
            if (items.length > 0) {
                output += `${label}\n${items.join('\n')}\n\n`;
            }
        }

        if (heards.length > 0 || stories.length > 0) {
            output += "---\n";
            heards.forEach((h, i) => {
                output += `[${i + 1}] ${h.url}\n`;
            });
            stories.forEach((s, i) => {
                output += `[${i + 1 + heards.length}] ${s.url}\n`;
            });
        }

        console.log(output.trim());

    } catch (err) {
        console.error(err);
    }
}

processOutput();
