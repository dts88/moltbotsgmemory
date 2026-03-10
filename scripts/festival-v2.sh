#!/bin/bash
export HOME=/home/node/clawd
OPENHUE="./bin/openhue"

WLED_AP1="192.168.1.143"
WLED_AP2="192.168.1.144"

# 节日色系
COLORS=("255,45,0" "255,215,0" "255,69,0" "255,20,147")  # 红 金 橙 粉
HEX=("#FF2D00" "#FFD700" "#FF4500" "#FF1493")

echo "🎊 全屋统一节日灯光 v2"

i=0
while true; do
  idx=$((i % 4))
  rgb="${COLORS[$idx]}"
  hex="${HEX[$idx]}"
  
  echo "[$i] 切换: $hex"
  
  # 准备 WLED AP2 - 所有4段同一效果
  AP2_DATA="{\"on\":true,\"bri\":255,\"seg\":[
    {\"id\":0,\"on\":true,\"fx\":63,\"pal\":6,\"col\":[[$rgb]]},
    {\"id\":1,\"on\":true,\"fx\":63,\"pal\":6,\"col\":[[$rgb]]},
    {\"id\":2,\"on\":true,\"fx\":63,\"pal\":6,\"col\":[[$rgb]]},
    {\"id\":3,\"on\":true,\"fx\":63,\"pal\":6,\"col\":[[$rgb]]}
  ]}"
  
  # 同时发送所有命令
  curl -s -X POST "http://$WLED_AP1/json/state" -H "Content-Type: application/json" \
    -d "{\"on\":true,\"bri\":255,\"seg\":[{\"fx\":63,\"pal\":6,\"col\":[[$rgb]]}]}" > /dev/null &
  
  curl -s -X POST "http://$WLED_AP2/json/state" -H "Content-Type: application/json" \
    -d "$AP2_DATA" > /dev/null &
  
  $OPENHUE set room "Living room" --rgb "$hex" --brightness 100 --transition-time 2s > /dev/null 2>&1 &
  
  wait
  echo "[$i] ✓ 同步完成"
  
  sleep 4
  ((i++))
done
