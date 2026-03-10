#!/bin/bash
export PATH="$HOME/.local/bin:$PATH"

# 高对比测试色
RED="#FF0000"
BLUE="#0000FF"
GREEN="#00FF00"
YELLOW="#FFFF00"
PURPLE="#FF00FF"
CYAN="#00FFFF"

echo "🔴🔵🟢🟡 Color test started!"

cycle=0
while true; do
  case $((cycle % 4)) in
    0)
      echo ">>> CYCLE $cycle: TV=RED, Dining=BLUE"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$RED" --transition-time 1s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$BLUE" --transition-time 1s
      ;;
    1)
      echo ">>> CYCLE $cycle: TV=GREEN, Dining=YELLOW"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$GREEN" --transition-time 1s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$YELLOW" --transition-time 1s
      ;;
    2)
      echo ">>> CYCLE $cycle: TV=PURPLE, Dining=CYAN"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$PURPLE" --transition-time 1s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$CYAN" --transition-time 1s
      ;;
    3)
      echo ">>> CYCLE $cycle: TV=YELLOW, Dining=RED"
      openhue set light "TV L1" "TV L2" "TV R1" "TV R2" --on --rgb "$YELLOW" --transition-time 1s
      sleep 1
      openhue set light "Dining 1" "Dining 2" "Dining 3" "Dining 4" --on --rgb "$RED" --transition-time 1s
      ;;
  esac
  
  ((cycle++))
  sleep 8
done
