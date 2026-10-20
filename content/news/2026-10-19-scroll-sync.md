---
date: 2026-10-19
order: 4
title.ja: 並べた本文がいっしょにスクロールするようにしました
title.en: Scroll side-by-side texts together
action.viewer: https://tei-eaj.github.io/parallel_text_viewer/data/pt/config.json
action.params: dir=v
---

## ja

本文を並べると、片方を読み進めたとき、もう片方も対応する箇所まで付いてきます。対応は `xml:id` と `@corresp` から取り、対応と対応の間は長さの割合で合わせるので、本文と訳とで段落の長さが違ってもずれません。ツールバーの「スクロール連動」で切ることができ、切った状態は URL に残ります。

## en

When texts are shown side by side, scrolling one now brings the others along to the matching passage. Matches come from `xml:id` and `@corresp`, and the space between two matches is mapped proportionally, so a text and its translation stay aligned even when their paragraphs differ in length. Turn it off with "Sync scrolling" in the toolbar; the setting stays in the URL.
