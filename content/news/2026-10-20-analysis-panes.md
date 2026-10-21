---
date: 2026-10-20
order: 5
title.ja: 固有名・発話・地図・年表のペインを追加しました
title.en: Added entities, speech, map, and timeline panes
action.href: /viewer
---

## ja

ビューア（`/viewer`）に 4 つの分析ペインを追加しました。人名・地名・組織名・日付を典拠（`listPerson`・`listPlace`・`listOrg`）と結んで集計する「固有名・日付」、発話（`sp`・`said`）を話者ごとに辿る「発話」、書簡の発着地（`correspDesc`）や経緯度（`geo`）を描く「地図」、書簡や出来事・日付を時系列に並べる「年表」を、TEI の中身に応じて自動で出します。

## en

Four analysis panes have been added to `/viewer`: Names & dates (people, places, organizations, and dates resolved against `listPerson`, `listPlace`, and `listOrg`), Speech (dialogue and speaker statistics from `sp` and `said`), Map (letter origins/destinations from `correspDesc` and `<geo>` coordinates on MapLibre), and Timeline (chronological view of letters, events, and dates).
