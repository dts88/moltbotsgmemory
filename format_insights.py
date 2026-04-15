import json
import sys
import os

def format_message(data):
    heards = data.get('heards', [])
    stories = data.get('stories', [])
    
    groups = {
        'crude': '原油',
        'products': '成品油',
        'fuelOil': '燃料油',
        'lng': 'LNG'
    }
    
    grouped_heards = {name: [] for name in groups.values()}
    for h in heards:
        cat = h.get('category')
        if cat in groups:
            grouped_heards[groups[cat]].append(h)
            
    grouped_stories = {name: [] for name in groups.values()}
    for s in stories:
        cat = s.get('category')
        if cat in groups:
            grouped_stories[groups[cat]].append(s)
            
    output_lines = []
    links = []
    link_count = 1

    # 1. Process Heards
    for group_name, items in grouped_heards.items():
        if items:
            output_lines.append(f"{group_name}:")
            for item in items:
                headline = item.get('headline', '').strip()
                headline = headline.replace('**', '')
                output_lines.append(f"{headline} [{link_count}]")
                links.append(f"[{link_count}] {item.get('url')}")
                link_count += 1
            output_lines.append("") 

    # 2. Process Stories
    for group_name, items in grouped_stories.items():
        if items:
            output_lines.append(f"{group_name}:")
            for item in items:
                headline = item.get('headline', '').strip()
                headline = headline.replace('**', '')
                output_lines.append(f"{headline} [{link_count}]")
                links.append(f"[{link_count}] {item.get('url')}")
                link_count += 1
            output_lines.append("")

    if not output_lines:
        return None

    msg = "\n".join(output_lines).strip()
    
    if links:
        msg += "\n---\n" + "\n".join(links)
        
    return msg

if __name__ == "__main__":
    input_file = sys.argv[1] if len(sys.argv) > 1 else 'raw_output.json'
    try:
        with open(input_file, 'r') as f:
            input_data = json.load(f)
        result = format_message(input_data)
        if result:
            print(result)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
