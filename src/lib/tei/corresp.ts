// TEI の書簡メタデータ（correspDesc）、場所と座標（listPlace / place / geo）、年表（correspAction / event / 本文の date）を抽出する。
// TEI-EAJ/letter、TEI-EAJ/app、tei_viewer などのエンコーディングに対応する。

import type { GeoFeature } from '@/components/map/geo';
import { entityId, entityKindOf, normalizeRef, textEntities } from './entities';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const HTTP_RE = /^https?:\/\//i;

const xmlId = (el: Element): string | null =>
  el.getAttribute('xml:id') ?? el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('id');

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

export interface CorrespActionInfo {
  type: 'sent' | 'received' | 'transmitted' | 'redirected' | 'other';
  persName?: string;
  placeName?: string;
  placeRef?: string;
  dateText?: string;
  dateWhen?: string;
  coords?: [number, number]; /* [lng, lat] GeoJSON order */
}

export interface CorrespHeader {
  id: string;
  title?: string;
  actions: CorrespActionInfo[];
}

export interface TeiPlacePoint {
  id: string;
  label: string;
  coords: [number, number] | null; /* [lng, lat] */
  geoJsonUrl?: string;
  description?: string;
  role?: 'sent' | 'received' | 'mention' | 'listPlace';
  count: number;
  mentionIds: string[];
  externalUrl?: string;
}

export interface TimelineEntry {
  id: string;
  targetId: string | null; /* element id in text to select/scroll to, or null if header-only */
  dateKey: string; /* normalized ISO-like string for sorting, e.g. '1914-08-01' */
  dateLabel: string;
  kind: 'corresp-sent' | 'corresp-received' | 'event' | 'text-date';
  title: string;
  detail?: string;
  placeName?: string;
}

/**
 * TEI <geo> の文字列（通常 "lat lng" または "lat, lng"）を解析し、
 * GeoJSON 順の [lng, lat] を返す。不正な値なら null。
 */
export function parseGeo(text: string | null | undefined): [number, number] | null {
  const raw = clean(text);
  if (!raw) return null;
  const parts = raw.split(/[\s,]+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

function textWithoutGeoAndNotes(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        out += child.nodeValue ?? '';
      } else if (child.nodeType === 1) {
        const tag = (child as Element).localName;
        if (tag === 'geo' || tag === 'location' || tag === 'note' || tag === 'bibl' || tag === 'idno') continue;
        walk(child);
      }
    }
  };
  walk(el);
  return clean(out);
}

function firstHttpInAttrs(el: Element, attrs: readonly string[]): string | null {
  for (const attr of attrs) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    for (const token of raw.trim().split(/\s+/)) {
      if (HTTP_RE.test(token)) return token;
    }
  }
  return null;
}

function extractPlaceExternalUrl(el: Element): string | undefined {
  const fromAttr = firstHttpInAttrs(el, ['sameAs', 'corresp', 'ref']);
  if (fromAttr) return fromAttr;
  for (const idno of Array.from(el.getElementsByTagNameNS('*', 'idno'))) {
    const val = clean(idno.textContent);
    if (HTTP_RE.test(val)) return val;
  }
  for (const note of Array.from(el.getElementsByTagNameNS('*', 'note'))) {
    if (clean(note.getAttribute('type')).toLowerCase() === 'schema:url') {
      const val = clean(note.textContent);
      if (HTTP_RE.test(val)) return val;
    }
  }
  return undefined;
}

function extractPlaceDescription(el: Element): string | undefined {
  const parts: string[] = [];
  for (const note of Array.from(el.getElementsByTagNameNS('*', 'note'))) {
    const t = clean(note.getAttribute('type')).toLowerCase();
    if (t === 'schema:description' || !t) {
      const val = clean(note.textContent);
      if (val && !HTTP_RE.test(val)) parts.push(val);
    }
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

function extractPlaceGeoJsonUrl(el: Element, baseUrl?: string): string | undefined {
  for (const note of Array.from(el.getElementsByTagNameNS('*', 'note'))) {
    if (clean(note.getAttribute('type')).toLowerCase() !== 'schema:geo') continue;
    const raw = clean(note.textContent);
    if (!raw || parseGeo(raw)) continue;
    if (HTTP_RE.test(raw)) return raw;
    if (baseUrl) {
      try {
        const geoBase = new URL('geojson/', baseUrl).href;
        return new URL(raw, geoBase).href;
      } catch {
        try {
          return new URL(raw, baseUrl).href;
        } catch {
          return raw;
        }
      }
    }
    return raw;
  }
  return undefined;
}

function findFirstGeoCoords(el: Element): [number, number] | null {
  if (el.localName === 'geo') return parseGeo(el.textContent);
  for (const g of Array.from(el.getElementsByTagNameNS('*', 'geo'))) {
    const coords = parseGeo(g.textContent);
    if (coords) return coords;
  }
  for (const note of Array.from(el.getElementsByTagNameNS('*', 'note'))) {
    if (clean(note.getAttribute('type')).toLowerCase() === 'schema:geo') {
      const coords = parseGeo(note.textContent);
      if (coords) return coords;
    }
  }
  return null;
}

function extractPlaceLabel(placeEl: Element, fallbackId: string): string {
  for (const tag of ['placeName', 'geogName', 'label', 'settlement', 'region', 'country']) {
    const found = Array.from(placeEl.getElementsByTagNameNS('*', tag))[0];
    if (found) {
      const t = textWithoutGeoAndNotes(found);
      if (t) return t;
    }
  }
  return textWithoutGeoAndNotes(placeEl) || fallbackId;
}

interface PlaceCatalogEntry {
  id: string;
  label: string;
  coords: [number, number] | null;
  geoJsonUrl?: string;
  description?: string;
  externalUrl?: string;
}

function readPlaceCatalog(tei: Document, baseUrl?: string): Map<string, PlaceCatalogEntry> {
  const catalog = new Map<string, PlaceCatalogEntry>();
  const root = tei.documentElement;
  const places = Array.from(root.getElementsByTagNameNS('*', 'place'));
  places.forEach((placeEl, idx) => {
    const id = xmlId(placeEl) ?? `place-${idx + 1}`;
    const label = extractPlaceLabel(placeEl, id);
    const coords = findFirstGeoCoords(placeEl);
    const geoJsonUrl = extractPlaceGeoJsonUrl(placeEl, baseUrl);
    const description = extractPlaceDescription(placeEl);
    const externalUrl = extractPlaceExternalUrl(placeEl);
    catalog.set(id, {
      id,
      label,
      coords,
      ...(geoJsonUrl ? { geoJsonUrl } : {}),
      ...(description ? { description } : {}),
      externalUrl,
    });
  });
  return catalog;
}

function cleanRefId(rawRef: string | null | undefined): string | null {
  if (!rawRef) return null;
  for (const token of rawRef.trim().split(/\s+/)) {
    if (!token || token === '#') continue;
    const hashIdx = token.indexOf('#');
    if (hashIdx >= 0) {
      const frag = token.slice(hashIdx + 1);
      if (frag) return frag;
    } else if (!HTTP_RE.test(token)) {
      return token;
    }
  }
  return null;
}

const ISO_DATE_PREFIX_RE = /^(\d{4}(?:-\d{1,2}(?:-\d{1,2})?)?)/;
const TEXT_ISO_DATE_RE = /\b(\d{4}(?:-\d{1,2}(?:-\d{1,2})?)?)\b/;

function normalizeIsoDate(raw: string | null | undefined): string {
  const s = clean(raw);
  if (!s) return '';
  const m = ISO_DATE_PREFIX_RE.exec(s) ?? TEXT_ISO_DATE_RE.exec(s);
  if (!m) return '';
  const parts = m[1].split('-');
  const y = parts[0];
  const mo = parts[1] ? parts[1].padStart(2, '0') : undefined;
  const d = parts[2] ? parts[2].padStart(2, '0') : undefined;
  return [y, mo, d].filter(Boolean).join('-');
}

function extractDateAttr(el: Element): string {
  for (const attr of ['when', 'from', 'notBefore', 'to', 'notAfter']) {
    const val = clean(el.getAttribute(attr));
    if (val) return val;
  }
  return '';
}

function normalizeActionType(raw: string | null): CorrespActionInfo['type'] {
  const t = clean(raw).toLowerCase();
  if (t === 'sent' || t === 'received' || t === 'transmitted' || t === 'redirected') {
    return t;
  }
  return 'other';
}

/**
 * teiHeader / standOff の <correspDesc> から書簡の発受メタデータを抽出する。
 */
export function extractCorrespHeaders(tei: Document): CorrespHeader[] {
  const catalog = readPlaceCatalog(tei);
  const byLabel = new Map<string, PlaceCatalogEntry>();
  for (const entry of catalog.values()) {
    if (!byLabel.has(entry.label)) byLabel.set(entry.label, entry);
  }

  const root = tei.documentElement;
  const descs = Array.from(root.getElementsByTagNameNS('*', 'correspDesc'));

  return descs.map((desc, idx) => {
    const id = xmlId(desc) ?? `corresp-${idx + 1}`;
    const titleAttr = clean(desc.getAttribute('n'));
    const labelEl = Array.from(desc.children).find((c) => c.localName === 'label' || c.localName === 'title');
    const title = clean(labelEl?.textContent) || titleAttr || undefined;

    const actionEls = Array.from(desc.getElementsByTagNameNS('*', 'correspAction'));
    const actions: CorrespActionInfo[] = actionEls.map((actEl) => {
      const type = normalizeActionType(actEl.getAttribute('type'));

      const persEl =
        Array.from(actEl.getElementsByTagNameNS('*', 'persName'))[0] ??
        Array.from(actEl.getElementsByTagNameNS('*', 'orgName'))[0] ??
        Array.from(actEl.getElementsByTagNameNS('*', 'name'))[0];
      const persName = persEl ? clean(persEl.textContent) || undefined : undefined;

      const placeEl =
        Array.from(actEl.getElementsByTagNameNS('*', 'placeName'))[0] ??
        Array.from(actEl.getElementsByTagNameNS('*', 'settlement'))[0] ??
        Array.from(actEl.getElementsByTagNameNS('*', 'region'))[0];
      const rawPlaceRef =
        placeEl?.getAttribute('ref') ??
        placeEl?.getAttribute('corresp') ??
        placeEl?.getAttribute('key') ??
        null;
      const refId = cleanRefId(rawPlaceRef);
      const catalogPlace = refId ? catalog.get(refId) : undefined;
      const placeText = placeEl ? textWithoutGeoAndNotes(placeEl) : '';
      const placeName = placeText || catalogPlace?.label || undefined;
      const placeRef = refId ? `#${refId}` : rawPlaceRef ? clean(rawPlaceRef) : undefined;

      const dateEl = Array.from(actEl.getElementsByTagNameNS('*', 'date'))[0];
      const rawWhen = dateEl ? extractDateAttr(dateEl) : '';
      const dateText = dateEl ? clean(dateEl.textContent) || rawWhen || undefined : undefined;
      const dateWhen = (rawWhen ? normalizeIsoDate(rawWhen) || rawWhen : normalizeIsoDate(dateText)) || undefined;

      const inlineCoords = findFirstGeoCoords(actEl);
      const matchedByLabel = !catalogPlace && placeName ? byLabel.get(placeName) : undefined;
      const coords = inlineCoords ?? catalogPlace?.coords ?? matchedByLabel?.coords ?? undefined;

      return {
        type,
        persName,
        placeName,
        placeRef,
        dateText,
        dateWhen,
        coords,
      };
    });

    return { id, title, actions };
  });
}

/**
 * TEI 文書から座標付きの地点一覧（listPlace、correspAction、本文中の placeName）を抽出する。
 */
export function extractTeiPlaces(tei: Document, baseUrl?: string): TeiPlacePoint[] {
  const catalog = readPlaceCatalog(tei, baseUrl);
  const pointsMap = new Map<string, TeiPlacePoint>();
  const labelToId = new Map<string, string>();

  for (const entry of catalog.values()) {
    if (entry.coords || entry.geoJsonUrl) {
      pointsMap.set(entry.id, {
        id: entry.id,
        label: entry.label,
        coords: entry.coords,
        ...(entry.geoJsonUrl ? { geoJsonUrl: entry.geoJsonUrl } : {}),
        ...(entry.description ? { description: entry.description } : {}),
        role: 'listPlace',
        count: 0,
        mentionIds: [],
        externalUrl: entry.externalUrl,
      });
      if (!labelToId.has(entry.label)) {
        labelToId.set(entry.label, entry.id);
      }
    }
  }

  // correspDesc の発受地点を反映
  const headers = extractCorrespHeaders(tei);
  headers.forEach((h) => {
    h.actions.forEach((act, actIdx) => {
      const role: TeiPlacePoint['role'] =
        act.type === 'sent' ? 'sent' : act.type === 'received' ? 'received' : undefined;
      const refId = cleanRefId(act.placeRef);
      if (refId && pointsMap.has(refId)) {
        const pt = pointsMap.get(refId)!;
        if (role && (pt.role === 'listPlace' || pt.role === 'mention' || !pt.role)) {
          pt.role = role;
        }
        return;
      }
      if (act.placeName && labelToId.has(act.placeName)) {
        const mappedId = labelToId.get(act.placeName)!;
        const pt = pointsMap.get(mappedId)!;
        if (role && (pt.role === 'listPlace' || pt.role === 'mention' || !pt.role)) {
          pt.role = role;
        }
        return;
      }
      if (act.coords) {
        const id = refId || `corresp-place-${h.id}-${actIdx + 1}`;
        const label = act.placeName || id;
        if (!pointsMap.has(id)) {
          pointsMap.set(id, {
            id,
            label,
            coords: act.coords,
            role: role ?? 'listPlace',
            count: 0,
            mentionIds: [],
          });
          if (!labelToId.has(label)) labelToId.set(label, id);
        }
      }
    });
  });

  // 本文中の固有表現（textEntities と同じ順番・ID 採番）を走査して mentionIds を紐付ける
  const elements = textEntities(tei);
  elements.forEach((el, i) => {
    const n = i + 1;
    const mentionId = xmlId(el) ?? entityId(n);
    const kind = entityKindOf(el);
    if (kind !== 'placeName') return;

    const { keyId, href } = normalizeRef(el);
    const refId = cleanRefId(keyId);
    const labelText = textWithoutGeoAndNotes(el) || clean(el.textContent);

    let targetPoint: TeiPlacePoint | undefined;
    if (refId && pointsMap.has(refId)) {
      targetPoint = pointsMap.get(refId);
    } else if (labelText && labelToId.has(labelText)) {
      targetPoint = pointsMap.get(labelToId.get(labelText)!);
    } else {
      const inlineCoords = findFirstGeoCoords(el);
      if (inlineCoords) {
        const newId = refId || xmlId(el) || `text-place-${n}`;
        targetPoint = pointsMap.get(newId);
        if (!targetPoint) {
          const catEntry = refId ? catalog.get(refId) : undefined;
          targetPoint = {
            id: newId,
            label: catEntry?.label || labelText || newId,
            coords: inlineCoords,
            role: 'mention',
            count: 0,
            mentionIds: [],
            externalUrl: href ?? catEntry?.externalUrl,
          };
          pointsMap.set(newId, targetPoint);
          if (labelText && !labelToId.has(labelText)) {
            labelToId.set(labelText, newId);
          }
        }
      }
    }

    if (targetPoint) {
      targetPoint.mentionIds.push(mentionId);
      targetPoint.count = targetPoint.mentionIds.length;
      if (!targetPoint.externalUrl && href) {
        targetPoint.externalUrl = href;
      }
      if (!targetPoint.role || targetPoint.role === 'listPlace') {
        targetPoint.role = 'mention';
      }
    }
  });

  return Array.from(pointsMap.values());
}

/**
 * GeoJSON オブジェクト（FeatureCollection / Feature / Geometry）から中心座標 [lng, lat] を計算する。
 */
export function computeGeoJsonCenter(geojson: unknown): [number, number] | null {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let count = 0;

  const visitCoords = (coords: unknown) => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      const lng = coords[0];
      const lat = coords[1];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        count += 1;
      }
      return;
    }
    for (const item of coords) visitCoords(item);
  };

  const visitNode = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.features)) {
      for (const f of obj.features) visitNode(f);
    } else if (obj.geometry) {
      visitNode(obj.geometry);
    } else if (Array.isArray(obj.coordinates)) {
      visitCoords(obj.coordinates);
    }
  };

  visitNode(geojson);
  if (count === 0) return null;
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

/**
 * TeiPlacePoint[] を MapView 用の GeoFeature[] に変換する（座標のある地点のみ）。
 */
export function toGeoFeatures(places: TeiPlacePoint[]): GeoFeature[] {
  return places.flatMap((p) =>
    p.coords
      ? [
          {
            type: 'Feature' as const,
            id: p.id,
            geometry: {
              type: 'Point' as const,
              coordinates: p.coords,
            },
            properties: {
              title: p.label,
              tags: p.role ? [p.role] : undefined,
              url: p.externalUrl,
            },
          },
        ]
      : [],
  );
}

function buildContextSnippet(el: Element, maxLen = 60): string | undefined {
  const parent = el.parentElement;
  if (!parent) return undefined;
  const full = clean(parent.textContent);
  const self = clean(el.textContent);
  if (!full || full === self) return undefined;
  if (full.length <= maxLen) return full;
  const idx = self ? full.indexOf(self) : -1;
  if (idx < 0) return `${full.slice(0, maxLen)}…`;
  const half = Math.max(10, Math.floor((maxLen - self.length) / 2));
  const start = Math.max(0, idx - half);
  const end = Math.min(full.length, idx + self.length + half);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < full.length ? '…' : '';
  return `${prefix}${full.slice(start, end)}${suffix}`;
}

/**
 * 書簡の 발受日時（correspDesc）、イベント（listEvent/event）、本文中の日付（<date>）を統合し、
 * 時系列順（dateKey 昇順）に並べた TimelineEntry[] を返す。
 */
export function extractTimeline(tei: Document): TimelineEntry[] {
  const rawEntries: { entry: TimelineEntry; order: number }[] = [];
  let seq = 0;

  // 1. correspDesc actions
  const headers = extractCorrespHeaders(tei);
  headers.forEach((h) => {
    h.actions.forEach((act, actIdx) => {
      if (!act.dateWhen && !act.dateText) return;
      const dateKey = normalizeIsoDate(act.dateWhen) || normalizeIsoDate(act.dateText);
      const dateLabel = act.dateText || act.dateWhen || '';
      const kind: TimelineEntry['kind'] =
        act.type === 'sent' ? 'corresp-sent' : act.type === 'received' ? 'corresp-received' : 'event';
      const titleParts = [act.persName, act.placeName].filter(Boolean);
      const title = titleParts.join(' — ') || h.title || dateLabel;
      rawEntries.push({
        order: seq++,
        entry: {
          id: `tl-corresp-${h.id}-${actIdx + 1}`,
          targetId: null,
          dateKey,
          dateLabel,
          kind,
          title,
          detail: h.title && titleParts.length > 0 ? h.title : undefined,
          placeName: act.placeName,
        },
      });
    });
  });

  // 2. <event> elements in teiHeader / standOff / text
  const root = tei.documentElement;
  const eventEls = Array.from(root.getElementsByTagNameNS('*', 'event'));
  eventEls.forEach((evEl, idx) => {
    const rawAttrDate = extractDateAttr(evEl);
    const childDateEl = Array.from(evEl.getElementsByTagNameNS('*', 'date'))[0];
    const childAttrDate = childDateEl ? extractDateAttr(childDateEl) : '';
    const childDateText = childDateEl ? clean(childDateEl.textContent) : '';
    const dateKey =
      normalizeIsoDate(rawAttrDate) ||
      normalizeIsoDate(childAttrDate) ||
      normalizeIsoDate(childDateText);
    const dateLabel = childDateText || rawAttrDate || childAttrDate || dateKey;
    if (!dateLabel && !dateKey) return;

    const labelEl =
      Array.from(evEl.children).find((c) => c.localName === 'label' || c.localName === 'head') ??
      Array.from(evEl.getElementsByTagNameNS('*', 'label'))[0];
    const descEl =
      Array.from(evEl.children).find((c) => c.localName === 'desc' || c.localName === 'p' || c.localName === 'note') ??
      Array.from(evEl.getElementsByTagNameNS('*', 'desc'))[0];
    const placeEl = Array.from(evEl.getElementsByTagNameNS('*', 'placeName'))[0];
    const placeName = placeEl ? textWithoutGeoAndNotes(placeEl) || undefined : undefined;

    const labelText = labelEl ? clean(labelEl.textContent) : '';
    const descText = descEl ? clean(descEl.textContent) : '';
    const title = labelText || descText || clean(evEl.textContent) || dateLabel;
    const detail = labelText && descText && descText !== labelText ? descText : undefined;
    const evXmlId = xmlId(evEl);
    const inText = !evEl.closest('teiHeader, facsimile, standOff');

    rawEntries.push({
      order: seq++,
      entry: {
        id: evXmlId ? `tl-event-${evXmlId}` : `tl-event-${idx + 1}`,
        targetId: inText && evXmlId ? evXmlId : null,
        dateKey,
        dateLabel,
        kind: 'event',
        title,
        detail,
        placeName,
      },
    });
  });

  // 3. <date> mentions in <text>
  const elements = textEntities(tei);
  elements.forEach((el, i) => {
    const n = i + 1;
    const kind = entityKindOf(el);
    if (kind !== 'date') return;
    // <event> 内の <date> が本文中にあった場合の重複を避ける
    if (el.closest('event')) return;

    const mentionId = xmlId(el) ?? entityId(n);
    const text = clean(el.textContent);
    const rawAttr = extractDateAttr(el);
    const dateKey = normalizeIsoDate(rawAttr) || normalizeIsoDate(text);
    const dateLabel = text || rawAttr;
    if (!dateLabel) return;

    const detail = buildContextSnippet(el);

    rawEntries.push({
      order: seq++,
      entry: {
        id: `tl-date-${mentionId}`,
        targetId: mentionId,
        dateKey,
        dateLabel,
        kind: 'text-date',
        title: text || dateKey,
        detail,
      },
    });
  });

  rawEntries.sort((a, b) => {
    const ka = a.entry.dateKey;
    const kb = b.entry.dateKey;
    if (ka && kb) {
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.order - b.order;
    }
    if (ka && !kb) return -1;
    if (!ka && kb) return 1;
    return a.order - b.order;
  });

  return rawEntries.map((r) => r.entry);
}

export function hasMapData(tei: Document): boolean {
  return extractTeiPlaces(tei).length > 0 || extractCorrespHeaders(tei).length > 0;
}

export function hasTimelineData(tei: Document): boolean {
  const tl = extractTimeline(tei);
  if (tl.some((e) => e.kind !== 'text-date')) return true;
  return tl.filter((e) => Boolean(e.dateKey)).length >= 2;
}
