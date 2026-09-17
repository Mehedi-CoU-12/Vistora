













































export const MIN_SEARCH_LENGTH = 2;









export function normalizeSearchTerm(raw: string): string {
  return raw.replace(/\\/g, '').trim().replace(/\s+/g, ' ');
}


export function isSearchable(term: string): boolean {
  return term.length >= MIN_SEARCH_LENGTH;
}










export function ilikeFilter(columns: readonly string[], term: string): string {
  
  
  const value = `"%${term.replace(/"/g, '\\"')}%"`;

  return columns.map(column => `${column}.ilike.${value}`).join(',');
}
