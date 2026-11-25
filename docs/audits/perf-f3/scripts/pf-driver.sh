#!/usr/bin/env bash
OUT=${OUT:?}; : > "$OUT"
for rep in 1 2 3; do
 for sc in visit-only typing immediate savedata no-network-api; do
  for st in none idle adaptive selective; do
   node prefetch-matrix.mjs http://localhost:4174 $st $sc desktop >> "$OUT" 2>/dev/null
  done
 done
 for st in none idle adaptive selective; do node prefetch-matrix.mjs http://localhost:4174 $st typing mid >> "$OUT" 2>/dev/null; done
done
echo finished >> "$OUT.done"
