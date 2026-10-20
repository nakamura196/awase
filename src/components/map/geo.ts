// 地図に出す地点の型と、地点から id・タグ・リンクを取り出す関数。
// IIIF Kasane の ビューア部品にあったものを、TEI の地名（手紙の差出地など）でも使えるよう小さくして移した。

export type LngLat = [number, number];

/** 地図の縮尺と中心。 */
export interface GeorefMapView {
  zoom: number;
  lat: number;
  lng: number;
}

export interface GeoFeatureLink {
  /** Linked Places の関係（primaryTopicOf など）。 */
  type: string;
  identifier: string;
}

export interface GeoFeatureName {
  toponym: string;
  lang?: string;
}

export interface GeoFeature {
  '@id'?: string;
  id?: string;
  type: 'Feature';
  geometry: { coordinates: [number, number]; type: 'Point' };
  properties: {
    title: string;
    tags?: string[];
    /** links が無いときの「詳細」のリンク。 */
    url?: string;
  };
  metadata?: { tags?: string[] };
  links?: GeoFeatureLink[];
  /** 別名(異表記)。 */
  names?: GeoFeatureName[];
  /** 地点の画像。 */
  depictions?: { '@id': string }[];
}

/** 地点のリンク。properties.url から作ったものは type が 'detail'。 */
export interface GeoFeatureLinkView {
  type: string;
  href: string;
}

// 地図・一覧が地点を選ぶときの id
export const geoFeatureIdOf = (feature: GeoFeature, idx: number): string =>
  feature['@id'] || feature.id || `geo-feature-${idx}`;

// 地点のタグ: properties.tags、無ければ metadata.tags
export const geoFeatureTagsOf = (feature: GeoFeature): string[] =>
  (feature.properties.tags ?? feature.metadata?.tags ?? []).filter((t): t is string => typeof t === 'string' && t !== '');

// http(s) のリンクだけ通す（javascript: などをポップアップの href に入れない）
const httpUrl = (s: unknown): string | null => {
  if (typeof s !== 'string') return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
};

// 地点のリンク: links、無ければ properties.url を 'detail' として
export const geoFeatureLinksOf = (feature: GeoFeature): GeoFeatureLinkView[] => {
  const links = (Array.isArray(feature.links) ? feature.links : []).flatMap((link) => {
    const href = httpUrl(link?.identifier);
    return href ? [{ type: typeof link.type === 'string' && link.type ? link.type : 'detail', href }] : [];
  });
  if (links.length > 0) return links;
  const url = httpUrl(feature.properties.url);
  return url ? [{ type: 'detail', href: url }] : [];
};
