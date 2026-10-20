---
date: 2026-10-20
order: 1
title.ja: 本文の頁と画像を並べて読めるようにしました
title.en: Read each page next to its image
action.viewer: https://w3id.org/kouigenjimonogatari/tei/01.xml
action.params: dir=v
---

## ja

TEI の頁の目印（`pb`）が画像（`facsimile` の面や範囲、または IIIF の画像の URL）を指していれば、本文の横に、いま読んでいる頁の画像を出します。本文を読み進めると画像も替わり、画像の側で前後の頁へ移ると本文もその頁へ動きます。頁の目印を押しても、その頁の画像に替わります。

## en

When the page breaks (`pb`) of a TEI file point to images (a `facsimile` surface or zone, or an IIIF image URL), the viewer shows the image of the page you are reading next to the text. The image follows as you scroll, and moving to another page from the image side scrolls the text there. Clicking a page break also shows its image.
