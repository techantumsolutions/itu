// Safe lightweight CSV parser utility

export function parseCsv(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let inQuotes = false;
  let currentVal = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      row.push(currentVal.trim());
      lines.push(row);
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    lines.push(row);
  }
  
  // Filter out completely empty rows
  return lines.filter(r => r.length > 0 && r.some(cell => cell !== ''));
}

/** Resolves header mapping to column index based on name pattern list. */
export function resolveColumnIndex(headers: string[], patterns: string[]): number {
  const normHeaders = headers.map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  const normPatterns = patterns.map(p => p.trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
  
  for (const pattern of normPatterns) {
    const index = normHeaders.indexOf(pattern);
    if (index !== -1) return index;
  }
  
  // Fallback: look for partial matches
  for (const pattern of normPatterns) {
    const index = normHeaders.findIndex(h => h.includes(pattern));
    if (index !== -1) return index;
  }
  
  return -1;
}
