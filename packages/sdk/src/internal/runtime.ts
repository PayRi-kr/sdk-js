/** 런타임 감지 및 fetch 확보 (Node 20+ / 브라우저 / 엣지 공용). */

export const isNode =
  typeof process !== 'undefined' &&
  process.versions != null &&
  process.versions.node != null;

export type FetchLike = typeof fetch;

export function resolveFetch(custom?: FetchLike): FetchLike {
  if (custom) return custom;
  if (typeof globalThis.fetch === 'function') return globalThis.fetch.bind(globalThis);
  throw new Error(
    'fetch를 찾을 수 없습니다. Node 18+ 또는 fetch 폴리필이 필요하거나, 옵션으로 fetch를 주입해주세요.',
  );
}
