#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"

# 日落色系 - 黄昏天空的渐变
GOLDEN="#FFB347"        # 金橙
CORAL="#FF7F7F"         # 珊瑚
ROSE="#FF6B8A"          # 玫瑰粉
MAGENTA="#E05090"       # 洋红
PURPLE="#9060C0"        # 暮紫
PEACH="#FFAA80"         # 蜜桃
AMBER="#FFBF00"         # 琥珀
LAVENDER="#B08FC0"      # 淡紫

echo "🌅 日落氛围灯启动..."
openhue set room "Living room" --brightness 75

cycle=0
while true; do
  case $((cycle % 5)) in
    0)
      echo "[$cycle] 金橙 + 玫瑰粉"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$GOLDEN" --transition-time 4s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$ROSE" --transition-time 4s
      ;;
    1)
      echo "[$cycle] 珊瑚 + 暮紫"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$CORAL" --transition-time 4s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$PURPLE" --transition-time 4s
      ;;
    2)
      echo "[$cycle] 蜜桃 + 洋红"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$PEACH" --transition-time 4s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$MAGENTA" --transition-time 4s
      ;;
    3)
      echo "[$cycle] 琥珀 + 淡紫"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$AMBER" --transition-time 4s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$LAVENDER" --transition-time 4s
      ;;
    4)
      echo "[$cycle] 洋红 + 金橙"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$MAGENTA" --transition-time 4s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$GOLDEN" --transition-time 4s
      ;;
  esac
  
  ((cycle++))
  sleep 12
done
