---
date: 2026-10-20
order: 2
title.ja: 異文の一覧と伝本の読みの切り替えができるようになりました
title.en: Compare variant readings and switch witnesses
action.href: /viewer
---

## ja

TEI の校勘記（`app`・`lem`・`rdg@wit`）から異文の一覧を出し、本文と行き来できるようになりました。伝本を選ぶとその読みに本文が切り替わり（`?wit=`）、底本との編集距離の合計も棒グラフで比べられます。異文の箇所に画像の範囲（`app@facs`）が結ばれていれば、その箇所の画像も並べて見られます。

## en

When a TEI document contains critical apparatus entries (`app`, `lem`, `rdg@wit`), the viewer now lists variant readings linked with the text. You can switch the main text to any witness (`?wit=`), compare each witness's total edit distance from the lemma, and inspect image regions linked via `app@facs`.
