#!/bin/bash
export HOME=/home/node/clawd
OPENHUE="./bin/openhue"

# 🎊 节日明亮色系
COLORS=(
  "#FF2D00"  # 中国红
  "#FFD700"  # 金色
  "#FF6B00"  # 橙红
  "#FF1493"  # 亮粉
  "#FF4500"  # 橙色
  "#FFAA00"  # 琥珀
)

# 所有客厅灯
ALL_LIGHTS=(
  "TV L1" "TV L2" "TV R1" "TV R2"
  "Pantry 1" "Pantry 2" "Pantry 3"
  "Dining 1" "Dining 2" "Dining 3" "Dining 4"
  "Living 4"
  "Hue play gradient lightstrip"
)

echo "🎊 全屋节日灯光启动! (Ctrl+C 停止)"

i=0
while true; do
  for idx in "${!ALL_LIGHTS[@]}"; do
    color_idx=$(( (i + idx) % ${#COLORS[@]} ))
    $OPENHUE set light "${ALL_LIGHTS[$idx]}" --rgb "${COLORS[$color_idx]}" --brightness 100 --transition-time 1500ms 2>/dev/null &
  done
  
  wait
  sleep 2
  ((i++))
done
