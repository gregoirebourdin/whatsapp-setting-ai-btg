"use client";

import { useState, useCallback } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AddContactDialogProps {
  onContactAdded: () => void;
}

export function AddContactDialog({ onContactAdded }: AddContactDialogProps) {
  const [open, setOpen] = useState(false);
  const [firstname, setFirstname] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setFirstname("");
    setPhone("");
    setError(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (!firstname.trim() || !phone.trim()) {
        setError("Le prenom et le telephone sont requis.");
        return;
      }

      setSaving(true);
      try {
        const res = await fetch("/api/crm/contacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ firstname: firstname.trim(), phone: phone.trim() }),
        });

        const data = await res.json();

        if (res.ok) {
          onContactAdded();
          setOpen(false);
          resetForm();
        } else {
          setError(data.error || "Erreur lors de l'ajout");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur reseau");
      } finally {
        setSaving(false);
      }
    },
    [firstname, phone, onContactAdded, resetForm]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Ajouter un contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nouveau contact</DialogTitle>
            <DialogDescription>
              Ajoutez manuellement un contact a votre liste CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-firstname">Prenom</Label>
              <Input
                id="add-firstname"
                value={firstname}
                onChange={(e) => setFirstname(e.target.value)}
                placeholder="Jean"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add-phone">Telephone</Label>
              <Input
                id="add-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+33612345678"
              />
              <p className="text-xs text-muted-foreground">
                Format international avec indicatif pays (ex: +33 pour la France)
              </p>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Ajout..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
