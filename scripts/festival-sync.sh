#!/bin/bash
export HOME=/home/node/clawd
OPENHUE="./bin/openhue"

# WLED
WLED_AP1="192.168.1.143"
WLED_AP2="192.168.1.144"

# 节日色系
COLORS=("#FF2D00" "#FFD700" "#FF4500" "#FF1493")

# RGB hex 转数组
hex_to_rgb() {
  hex=${1#"#"}
  echo "$(( 16#${hex:0:2} )),$(( 16#${hex:2:2} )),$(( 16#${hex:4:2} ))"
}

echo "🎊 全屋统一节日灯光 (同步版)"

i=0
while true; do
  color="${COLORS[$((i % ${#COLORS[@]}))]}"
  rgb=$(hex_to_rgb "$color")
  
  echo "[$i] 准备切换: $color"
  
  # ========== 准备所有命令 ==========
  
  # WLED AP1: 使用 Colorloop 效果 (fx=2)，节日调色板
  CMD_AP1="curl -s -X POST 'http://$WLED_AP1/json/state' -d '{\"on\":true,\"bri\":255,\"seg\":[{\"fx\":63,\"pal\":6,\"sx\":80,\"col\":[[$rgb]]}]}'"
  
  # WLED AP2: 所有4段使用 Blends 效果 (fx=115)
  CMD_AP2="curl -s -X POST 'http://$WLED_AP2/json/state' -d '{\"on\":true,\"bri\":255,\"seg\":[{\"id\":0,\"fx\":63,\"pal\":6,\"sx\":80,\"col\":[[$rgb]]},{\"id\":1,\"fx\":63,\"pal\":6,\"sx\":80,\"col\":[[$rgb]]},{\"id\":2,\"fx\":63,\"pal\":6,\"sx\":80,\"col\":[[$rgb]]},{\"id\":3,\"fx\":63,\"pal\":6,\"sx\":80,\"col\":[[$rgb]]}]}'"
  
  # Hue: 整个房间一次设置
  CMD_HUE="$OPENHUE set room 'Living room' --rgb '$color' --brightness 100 --transition-time 2s"
  
  # ========== 同时执行 ==========
  eval "$CMD_AP1" > /dev/null 2>&1 &
  eval "$CMD_AP2" > /dev/null 2>&1 &
  eval "$CMD_HUE" > /dev/null 2>&1 &
  
  wait
  echo "[$i] ✓ 已同步切换"
  
  sleep 4
  ((i++))
done
