// DTS の入口（entry endpoint）の応答から、三つの窓口の URI テンプレートを取り出す。
import { isRecord, str } from './json';

export interface DtsEntry {
  version: string;
  /** どれも URI テンプレート（相対のままのことがある） */
  collection: string;
  navigation: string;
  document: string;
}

/** 入口の JSON を読む。collection が無ければ null（入口ではない） */
export function parseEntry(json: unknown): DtsEntry | null {
  if (!isRecord(json)) return null;
  // 古い書き方（collections / documents）も受ける
  const collection = str(json.collection) ?? str(json.collections);
  const document = str(json.document) ?? str(json.documents);
  const navigation = str(json.navigation);
  if (!collection) return null;
  return {
    version: str(json.dtsVersion) ?? str(json['dts:version']) ?? '',
    collection,
    navigation: navigation ?? '',
    document: document ?? '',
  };
}
