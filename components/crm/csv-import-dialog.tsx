"use client";

import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ParsedContact {
  firstname: string;
  phone: string;
}

interface ColumnMapping {
  headers: string[];
  firstnameIdx: number;
  phoneIdx: number;
  sampleRows: string[][];
}

interface CsvImportDialogProps {
  onImportComplete: () => void;
}

export function CsvImportDialog({ onImportComplete }: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    updated: number;
    errors?: string[];
  } | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [rawSeparator, setRawSeparator] = useState(",");
  const fileRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setParsedContacts([]);
    setParseErrors([]);
    setResult(null);
    setColumnMapping(null);
    setRawLines([]);
  }, []);

  // Proper CSV line parser that handles quoted fields (e.g. "Dupont, Jean")
  const parseCSVLine = useCallback((line: string, separator: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === separator && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }, []);

  // Detect the separator used in the CSV (comma, semicolon, tab)
  const detectSeparator = useCallback((headerLine: string): string => {
    // Count occurrences of each potential separator in the header
    const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0, "|": 0 };
    // Only count separators outside of quotes
    let inQuotes = false;
    for (const char of headerLine) {
      if (char === '"') inQuotes = !inQuotes;
      if (!inQuotes && char in counts) counts[char]++;
    }
    // Return the separator with the most occurrences (default to comma)
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best[1] > 0 ? best[0] : ",";
  }, []);

  const parseCSV = useCallback((text: string) => {
    // Strip UTF-8 BOM that Excel adds
    const cleanText = text.replace(/^\uFEFF/, "");

    const lines = cleanText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setParseErrors(["Le fichier doit contenir au moins un en-tete et une ligne de donnees."]);
      return;
    }

    const separator = detectSeparator(lines[0]);

    // Parse header
    const header = parseCSVLine(lines[0], separator).map((h) =>
      h.toLowerCase().replace(/"/g, "").trim()
    );
    const firstnameIdx = header.findIndex(
      (h) =>
        h === "firstname" ||
        h === "prenom" ||
        h === "prénom" ||
        h === "first_name" ||
        h === "nom" ||
        h === "name" ||
        h === "first name"
    );
    const phoneIdx = header.findIndex(
      (h) =>
        h === "phone" ||
        h === "telephone" ||
        h === "téléphone" ||
        h === "tel" ||
        h === "mobile" ||
        h === "numero" ||
        h === "numéro" ||
        h === "phone_number" ||
        h === "whatsapp" ||
        h === "number"
    );

    if (firstnameIdx === -1 || phoneIdx === -1) {
      // Save raw data for manual column mapping
      const sampleRows = lines.slice(1, 4).map((line) => parseCSVLine(line, separator));
      setColumnMapping({
        headers: header,
        firstnameIdx: firstnameIdx !== -1 ? firstnameIdx : -1,
        phoneIdx: phoneIdx !== -1 ? phoneIdx : -1,
        sampleRows,
      });
      setRawLines(lines);
      setRawSeparator(separator);
      return;
    }

    const contacts: ParsedContact[] = [];
    const errors: string[] = [];
    const seenPhones = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i], separator);
      const firstname = cols[firstnameIdx]?.replace(/"/g, "").trim();
      const rawPhone = cols[phoneIdx]?.replace(/"/g, "").trim();

      if (!firstname && !rawPhone) continue;

      if (!firstname) {
        errors.push(`Ligne ${i + 1}: prenom manquant`);
        continue;
      }
      if (!rawPhone) {
        errors.push(`Ligne ${i + 1}: telephone manquant`);
        continue;
      }

      // Normalize phone: remove spaces, dashes, parentheses, dots
      let phone = rawPhone.replace(/[\s\-().]/g, "");

      // Convert 00XX to +XX format
      if (phone.startsWith("00") && phone.length > 10) {
        phone = "+" + phone.slice(2);
      }
      // French local numbers: 06/07 -> +336/+337
      if (phone.match(/^0[67]/) && phone.length === 10) {
        phone = "+33" + phone.slice(1);
      }

      // Ensure + prefix for international
      if (!phone.startsWith("+") && phone.length > 10) {
        phone = "+" + phone;
      }

      if (phone.replace(/\+/g, "").length < 8) {
        errors.push(`Ligne ${i + 1}: numero trop court (${phone})`);
        continue;
      }

      // Deduplicate within the CSV file itself
      if (seenPhones.has(phone)) {
        errors.push(`Ligne ${i + 1}: doublon ignore (${phone})`);
        continue;
      }
      seenPhones.add(phone);

      contacts.push({ firstname, phone });
    }

    setParsedContacts(contacts);
    setParseErrors(errors);
  }, [detectSeparator, parseCSVLine]);

  // Called when user manually maps columns and clicks "Confirmer"
  const applyManualMapping = useCallback(() => {
    if (!columnMapping || columnMapping.firstnameIdx === -1 || columnMapping.phoneIdx === -1) {
      setParseErrors(["Veuillez selectionner une colonne pour le prenom et le telephone."]);
      return;
    }

    const contacts: ParsedContact[] = [];
    const errors: string[] = [];
    const seenPhones = new Set<string>();

    for (let i = 1; i < rawLines.length; i++) {
      const cols = parseCSVLine(rawLines[i], rawSeparator);
      const firstname = cols[columnMapping.firstnameIdx]?.replace(/"/g, "").trim();
      const rawPhone = cols[columnMapping.phoneIdx]?.replace(/"/g, "").trim();

      if (!firstname && !rawPhone) continue;
      if (!firstname) { errors.push(`Ligne ${i + 1}: prenom manquant`); continue; }
      if (!rawPhone) { errors.push(`Ligne ${i + 1}: telephone manquant`); continue; }

      let phone = rawPhone.replace(/[\s\-().]/g, "");
      if (phone.startsWith("00") && phone.length > 10) phone = "+" + phone.slice(2);
      if (phone.match(/^0[67]/) && phone.length === 10) phone = "+33" + phone.slice(1);
      if (!phone.startsWith("+") && phone.length > 10) phone = "+" + phone;
      if (phone.replace(/\+/g, "").length < 8) { errors.push(`Ligne ${i + 1}: numero trop court (${phone})`); continue; }
      if (seenPhones.has(phone)) { errors.push(`Ligne ${i + 1}: doublon ignore (${phone})`); continue; }
      seenPhones.add(phone);

      contacts.push({ firstname, phone });
    }

    setParsedContacts(contacts);
    setParseErrors(errors);
    setColumnMapping(null);
  }, [columnMapping, rawLines, rawSeparator, parseCSVLine]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;

      setFile(f);
      setResult(null);
      setParseErrors([]);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseCSV(text);
      };
      reader.onerror = () => {
        setParseErrors(["Erreur lors de la lecture du fichier."]);
      };
      reader.readAsText(f, "UTF-8");
    },
    [parseCSV]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const f = e.dataTransfer.files?.[0];
      if (!f) return;

      // Accept .csv and .txt files
      const validExtensions = [".csv", ".txt", ".tsv"];
      const hasValidExt = validExtensions.some((ext) => f.name.toLowerCase().endsWith(ext));
      const hasValidType = f.type === "text/csv" || f.type === "text/plain" || f.type === "text/tab-separated-values" || f.type === "";

      if (!hasValidExt && !hasValidType) {
        setParseErrors(["Format non supporte. Veuillez utiliser un fichier .csv, .txt ou .tsv"]);
        return;
      }

      setFile(f);
      setResult(null);
      setParseErrors([]);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseCSV(text);
      };
      reader.onerror = () => {
        setParseErrors(["Erreur lors de la lecture du fichier."]);
      };
      reader.readAsText(f, "UTF-8");
    },
    [parseCSV]
  );

  const handleImport = useCallback(async () => {
    if (parsedContacts.length === 0) return;

    setImporting(true);
    try {
      const res = await fetch("/api/crm/contacts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: parsedContacts }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({
          imported: data.imported,
          updated: data.updated,
          errors: data.errors,
        });
        onImportComplete();
      } else {
        setParseErrors([data.error || "Erreur lors de l'import"]);
      }
    } catch (err) {
      setParseErrors([err instanceof Error ? err.message : "Erreur reseau"]);
    } finally {
      setImporting(false);
    }
  }, [parsedContacts, onImportComplete]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          Importer CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer des contacts</DialogTitle>
          <DialogDescription>
            Importez un fichier CSV avec deux colonnes : <strong>firstname</strong> (ou prenom) et{" "}
            <strong>phone</strong> (ou telephone). Les separateurs acceptes sont la virgule, le
            point-virgule ou la tabulation.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Drop zone */}
          {!result && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border p-8 transition-colors hover:border-foreground/30 hover:bg-secondary/50"
            >
              <FileText className="h-10 w-10 text-muted-foreground" />
              {file ? (
                <div className="text-center">
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {parsedContacts.length} contacts trouves
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-medium text-foreground">
                    Glissez votre fichier CSV ici
                  </p>
                  <p className="text-sm text-muted-foreground">
                    ou cliquez pour parcourir
                  </p>
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt,.tsv,text/csv,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          )}

          {/* Column mapping UI - shown when auto-detect fails */}
          {columnMapping && !result && (
            <div className="space-y-4">
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Les colonnes n'ont pas pu etre detectees automatiquement.
                  Associez chaque champ a la bonne colonne ci-dessous.
                </AlertDescription>
              </Alert>

              {/* Show sample data */}
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      {columnMapping.headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium text-foreground">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {columnMapping.sampleRows.map((row, ri) => (
                      <tr key={ri} className="border-b border-border last:border-0">
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5 text-muted-foreground">
                            {cell.replace(/"/g, "").slice(0, 30) || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Prenom</label>
                  <select
                    value={columnMapping.firstnameIdx}
                    onChange={(e) =>
                      setColumnMapping({
                        ...columnMapping,
                        firstnameIdx: parseInt(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value={-1}>-- Selectionner --</option>
                    {columnMapping.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                        {columnMapping.sampleRows[0]?.[i]
                          ? ` (ex: ${columnMapping.sampleRows[0][i].replace(/"/g, "").slice(0, 20)})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Telephone</label>
                  <select
                    value={columnMapping.phoneIdx}
                    onChange={(e) =>
                      setColumnMapping({
                        ...columnMapping,
                        phoneIdx: parseInt(e.target.value),
                      })
                    }
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  >
                    <option value={-1}>-- Selectionner --</option>
                    {columnMapping.headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h}
                        {columnMapping.sampleRows[0]?.[i]
                          ? ` (ex: ${columnMapping.sampleRows[0][i].replace(/"/g, "").slice(0, 20)})`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button
                onClick={applyManualMapping}
                disabled={columnMapping.firstnameIdx === -1 || columnMapping.phoneIdx === -1}
                className="w-full"
              >
                Confirmer le mapping
              </Button>
            </div>
          )}

          {/* Preview */}
          {parsedContacts.length > 0 && !result && (
            <div className="rounded-lg border border-border">
              <div className="border-b border-border bg-secondary/50 px-4 py-2">
                <p className="text-sm font-medium text-foreground">
                  Apercu ({Math.min(parsedContacts.length, 5)} sur {parsedContacts.length})
                </p>
              </div>
              <div className="divide-y divide-border">
                {parsedContacts.slice(0, 5).map((c, i) => (
                  <div key={i} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="text-foreground">{c.firstname}</span>
                    <span className="font-mono text-muted-foreground">{c.phone}</span>
                  </div>
                ))}
                {parsedContacts.length > 5 && (
                  <div className="px-4 py-2 text-center text-sm text-muted-foreground">
                    ... et {parsedContacts.length - 5} autres
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Errors */}
          {parseErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc pl-4 text-sm">
                  {parseErrors.slice(0, 5).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                  {parseErrors.length > 5 && (
                    <li>... et {parseErrors.length - 5} autres erreurs</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {result && (
            <Alert className="border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <AlertDescription className="text-emerald-700">
                <strong>{result.imported}</strong> nouveaux contacts importes,{" "}
                <strong>{result.updated}</strong> mis a jour.
                {result.errors && result.errors.length > 0 && (
                  <span className="block text-sm text-muted-foreground">
                    {result.errors.length} erreurs rencontrees.
                  </span>
                )}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          {result ? (
            <Button onClick={() => { setOpen(false); resetState(); }}>
              Fermer
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={parsedContacts.length === 0 || importing}
              className="gap-2"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {importing
                ? "Import en cours..."
                : `Importer ${parsedContacts.length} contacts`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
