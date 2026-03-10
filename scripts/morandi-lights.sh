#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"

# 莫兰迪色系 - 稍微提高饱和度版
DUSTY_ROSE="#E8A0A0"    # 豆沙粉
SAGE="#7FA37F"          # 灰绿
STEEL_BLUE="#7090A0"    # 雾霾蓝
LAVENDER="#A090C0"      # 香芋紫
TERRACOTTA="#C09080"    # 陶土橘
MOSS="#808F70"          # 苔藓绿
MAUVE="#B080A0"         # 藕荷
SAND="#C0A880"          # 暖沙

echo "🎨 莫兰迪氛围灯 v3 启动..."
openhue set room "Living room" --brightness 80

cycle=0
while true; do
  case $((cycle % 6)) in
    0)
      echo "[$cycle] 豆沙粉 + 雾霾蓝"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$DUSTY_ROSE" --transition-time 3s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$STEEL_BLUE" --transition-time 3s
      ;;
    1)
      echo "[$cycle] 香芋紫 + 灰绿"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$LAVENDER" --transition-time 3s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$SAGE" --transition-time 3s
      ;;
    2)
      echo "[$cycle] 陶土橘 + 藕荷"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$TERRACOTTA" --transition-time 3s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$MAUVE" --transition-time 3s
      ;;
    3)
      echo "[$cycle] 苔藓绿 + 豆沙粉"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$MOSS" --transition-time 3s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$DUSTY_ROSE" --transition-time 3s
      ;;
    4)
      echo "[$cycle] 暖沙 + 香芋紫"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$SAND" --transition-time 3s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$LAVENDER" --transition-time 3s
      ;;
    5)
      echo "[$cycle] 雾霾蓝 + 陶土橘"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$STEEL_BLUE" --transition-time 3s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$TERRACOTTA" --transition-time 3s
      ;;
  esac
  
  ((cycle++))
  sleep 12
done
