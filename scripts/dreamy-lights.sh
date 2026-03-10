#!/bin/bash
export HOME=/home/node/clawd
OPENHUE="./bin/openhue"

# 梦幻色系
COLORS=(
  "#9B59B6"  # 紫
  "#3498DB"  # 蓝
  "#E91E8C"  # 粉
  "#00CED1"  # 青
  "#8E44AD"  # 深紫
  "#1ABC9C"  # 薄荷
)

LIGHTS=("TV L1" "TV L2" "TV R1" "TV R2")

echo "✨ 梦幻灯光启动... (Ctrl+C 停止)"

i=0
while true; do
  for idx in 0 1 2 3; do
    color_idx=$(( (i + idx) % ${#COLORS[@]} ))
    $OPENHUE set light "${LIGHTS[$idx]}" --rgb "${COLORS[$color_idx]}" --brightness 80 --transition-time 2s 2>/dev/null &
  done
  # gradient strip 单独处理
  strip_color=$(( (i + 2) % ${#COLORS[@]} ))
  $OPENHUE set light "Hue play gradient lightstrip" --rgb "${COLORS[$strip_color]}" --brightness 75 --transition-time 2s 2>/dev/null &
  
  wait
  sleep 3
  ((i++))
done
