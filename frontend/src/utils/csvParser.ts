import Papa from 'papaparse';
import type { CSVParseSummary, ParsedRecipient } from '../types/index.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parses and validates CSV files for email recipient import.
 *
 * Supports header detection (name, email) as well as headerless CSVs.
 * Filters empty rows, rejects invalid emails, and deduplicates addresses (case-insensitive).
 */
export async function parseRecipientCSV(file: File): Promise<CSVParseSummary> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string> | string[]>(file, {
      header: false,
      skipEmptyLines: 'greedy',
      complete: (results) => {
        try {
          const rawRows = results.data;
          if (!rawRows || rawRows.length === 0) {
            resolve({
              totalRows: 0,
              validCount: 0,
              invalidCount: 0,
              duplicatesRemoved: 0,
              validRecipients: [],
              invalidRows: ['File is empty or contains no readable text.'],
            });
            return;
          }

          let emailColIdx = -1;
          let nameColIdx = -1;
          let startIndex = 0;

          // Check if first row is a header row
          const firstRow = rawRows[0];

          if (Array.isArray(firstRow)) {
            const normalizedHeaders = firstRow.map((h) => String(h).trim().toLowerCase());
            const foundEmailIdx = normalizedHeaders.findIndex(
              (h) => h === 'email' || h === 'e-mail' || h === 'email address' || h === 'recipient',
            );
            const foundNameIdx = normalizedHeaders.findIndex(
              (h) => h === 'name' || h === 'full name' || h === 'recipient name',
            );

            if (foundEmailIdx !== -1) {
              emailColIdx = foundEmailIdx;
              nameColIdx = foundNameIdx;
              startIndex = 1; // Header row consumed
            }
          }

          // Fallback column detection if no explicit header matched
          if (emailColIdx === -1) {
            // Sample first 5 non-header rows to find column containing valid emails
            const sampleRows = rawRows.slice(0, 5);
            for (const row of sampleRows) {
              const cells = Array.isArray(row)
                ? row
                : Object.values(row);

              for (let i = 0; i < cells.length; i++) {
                const cellStr = String(cells[i] || '').trim();
                if (EMAIL_REGEX.test(cellStr)) {
                  emailColIdx = i;
                  nameColIdx = i === 0 ? 1 : 0;
                  break;
                }
              }
              if (emailColIdx !== -1) break;
            }
          }

          if (emailColIdx === -1) {
            // Default: assume column 0 is email if not detected
            emailColIdx = 0;
            nameColIdx = 1;
          }

          const seenEmails = new Set<string>();
          const validRecipients: ParsedRecipient[] = [];
          const invalidRows: string[] = [];
          let duplicatesCount = 0;
          let totalDataRows = 0;

          for (let i = startIndex; i < rawRows.length; i++) {
            totalDataRows++;
            const row = rawRows[i];
            let rawEmail = '';
            let rawName = '';

            if (Array.isArray(row)) {
              rawEmail = String(row[emailColIdx] || '').trim();
              if (nameColIdx !== -1 && row[nameColIdx]) {
                rawName = String(row[nameColIdx]).trim();
              }
            } else if (typeof row === 'object' && row !== null) {
              const values = Object.values(row);
              rawEmail = String(values[emailColIdx] || '').trim();
              if (nameColIdx !== -1 && values[nameColIdx]) {
                rawName = String(values[nameColIdx]).trim();
              }
            }

            if (!rawEmail) {
              invalidRows.push(`Row ${i + 1}: Empty email address.`);
              continue;
            }

            if (!EMAIL_REGEX.test(rawEmail)) {
              invalidRows.push(`Row ${i + 1}: Invalid email format '${rawEmail}'.`);
              continue;
            }

            const normalizedEmail = rawEmail.toLowerCase();
            if (seenEmails.has(normalizedEmail)) {
              duplicatesCount++;
              continue;
            }

            seenEmails.add(normalizedEmail);
            validRecipients.push({
              email: normalizedEmail,
              name: rawName || undefined,
            });
          }

          resolve({
            totalRows: totalDataRows,
            validCount: validRecipients.length,
            invalidCount: invalidRows.length,
            duplicatesRemoved: duplicatesCount,
            validRecipients,
            invalidRows,
          });
        } catch (err: any) {
          reject(new Error(`CSV parsing error: ${err?.message || err}`));
        }
      },
      error: (error) => {
        reject(new Error(`CSV read error: ${error.message}`));
      },
    });
  });
}
