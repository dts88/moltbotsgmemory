#!/bin/bash
export HOME=/home/node/clawd
OPENHUE="./bin/openhue"

# 节日色系 - 全屋同步
COLORS=(
  "#FF2D00"  # 中国红
  "#FFD700"  # 金色
  "#FF4500"  # 橙红
  "#FF1493"  # 亮粉
)

# 所有 Hue 灯
LIGHTS=(
  "TV L1" "TV L2" "TV R1" "TV R2"
  "Pantry 1" "Pantry 2" "Pantry 3"
  "Dining 1" "Dining 2" "Dining 3" "Dining 4"
  "Living 4"
  "Hue play gradient lightstrip"
)

# WLED IP
WLED_AP1="192.168.1.143"
WLED_AP2="192.168.1.144"

# RGB hex 转 WLED 数组
hex_to_rgb() {
  hex=${1#"#"}
  echo "[$(( 16#${hex:0:2} )),$(( 16#${hex:2:2} )),$(( 16#${hex:4:2} ))]"
}

echo "🎊 全屋统一节日灯光启动!"

i=0
while true; do
  color="${COLORS[$((i % ${#COLORS[@]}))]}"
  rgb=$(hex_to_rgb "$color")
  
  echo "切换: $color"
  
  # 所有 Hue 灯同时切换
  for light in "${LIGHTS[@]}"; do
    $OPENHUE set light "$light" --rgb "$color" --brightness 100 --transition-time 2s 2>/dev/null &
  done
  
  # WLED 同步切换 (固态颜色 fx=0)
  curl -s -X POST "http://$WLED_AP1/json/state" \
    -H "Content-Type: application/json" \
    -d "{\"on\":true,\"bri\":255,\"transition\":20,\"seg\":[{\"fx\":0,\"col\":[$rgb]}]}" > /dev/null &
  
  curl -s -X POST "http://$WLED_AP2/json/state" \
    -H "Content-Type: application/json" \
    -d "{\"on\":true,\"bri\":255,\"transition\":20,\"seg\":[{\"fx\":0,\"col\":[$rgb]}]}" > /dev/null &
  
  wait
  sleep 3
  ((i++))
done
