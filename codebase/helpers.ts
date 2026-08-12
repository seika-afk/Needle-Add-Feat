// helpers includes
//
// ->>> for now : choosing the person they wanna do research about and matching role acc to query

import { TombaEmailResult } from "./typesCuzTSwantsThem";

export function matchesRole(candidate: TombaEmailResult, roleKeywords: string[]): boolean {
  if (roleKeywords.length === 0) return true;
  const position = (candidate.position ?? '').toLowerCase();
  return roleKeywords.some((kw) => position.includes(kw.toLowerCase()));
}
