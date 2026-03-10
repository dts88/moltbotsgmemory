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

LIGHTS=("TV L1" "TV L2" "TV R1" "TV R2")

echo "🎊 节日灯光启动! (Ctrl+C 停止)"

i=0
while true; do
  for idx in 0 1 2 3; do
    color_idx=$(( (i + idx) % ${#COLORS[@]} ))
    $OPENHUE set light "${LIGHTS[$idx]}" --rgb "${COLORS[$color_idx]}" --brightness 100 --transition-time 1s 2>/dev/null &
  done
  strip_color=$(( (i + 2) % ${#COLORS[@]} ))
  $OPENHUE set light "Hue play gradient lightstrip" --rgb "${COLORS[$strip_color]}" --brightness 100 --transition-time 1s 2>/dev/null &
  
  wait
  sleep 2
  ((i++))
done
