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
  const fileRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setFile(null);
    setParsedContacts([]);
    setParseErrors([]);
    setResult(null);
  }, []);

  const parseCSV = useCallback((text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      setParseErrors(["Le fichier doit contenir au moins un en-tete et une ligne de donnees."]);
      return;
    }

    // Parse header
    const header = lines[0].toLowerCase().split(/[,;|\t]/).map((h) => h.trim().replace(/"/g, ""));
    const firstnameIdx = header.findIndex(
      (h) =>
        h === "firstname" ||
        h === "prenom" ||
        h === "prénom" ||
        h === "first_name" ||
        h === "nom"
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
        h === "phone_number"
    );

    if (firstnameIdx === -1 || phoneIdx === -1) {
      setParseErrors([
        `Colonnes introuvables. En-tetes detectes: ${header.join(", ")}. Colonnes requises: firstname (ou prenom), phone (ou telephone).`,
      ]);
      return;
    }

    const contacts: ParsedContact[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(/[,;|\t]/).map((c) => c.trim().replace(/"/g, ""));
      const firstname = cols[firstnameIdx]?.trim();
      const phone = cols[phoneIdx]?.trim();

      if (!firstname && !phone) continue;

      if (!firstname) {
        errors.push(`Ligne ${i + 1}: prenom manquant`);
        continue;
      }
      if (!phone) {
        errors.push(`Ligne ${i + 1}: telephone manquant`);
        continue;
      }

      contacts.push({ firstname, phone });
    }

    setParsedContacts(contacts);
    setParseErrors(errors);
  }, []);

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
      reader.readAsText(f);
    },
    [parseCSV]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (!f || !f.name.endsWith(".csv")) return;

      setFile(f);
      setResult(null);
      setParseErrors([]);

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(f);
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
                accept=".csv"
                onChange={handleFileChange}
                className="hidden"
              />
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
