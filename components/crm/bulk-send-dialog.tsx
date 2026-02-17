"use client";

import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FileText,
  MessageSquare,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface Template {
  name: string;
  status: string;
  language: string;
  category: string;
  components: Array<{
    type: string;
    text?: string;
    format?: string;
    example?: { body_text?: string[][] };
    buttons?: Array<{ type: string; text: string; url?: string; phone_number?: string }>;
  }>;
}

interface BulkSendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedContactIds: string[];
  selectedContactsCount: number;
  onSendComplete: () => void;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function getComponentIcon(type: string) {
  switch (type) {
    case "HEADER":
      return <FileText className="h-3.5 w-3.5" />;
    case "BODY":
      return <MessageSquare className="h-3.5 w-3.5" />;
    case "FOOTER":
      return <FileText className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

function getFormatIcon(format?: string) {
  switch (format) {
    case "IMAGE":
      return <ImageIcon className="h-3.5 w-3.5" />;
    case "VIDEO":
      return <Video className="h-3.5 w-3.5" />;
    default:
      return null;
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "APPROVED":
      return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
    case "PENDING":
      return "bg-amber-500/10 text-amber-700 border-amber-500/20";
    case "REJECTED":
      return "bg-red-500/10 text-red-700 border-red-500/20";
    default:
      return "bg-secondary text-secondary-foreground";
  }
}

function getCategoryLabel(category: string) {
  switch (category) {
    case "MARKETING":
      return "Marketing";
    case "UTILITY":
      return "Utilitaire";
    case "AUTHENTICATION":
      return "Authentification";
    default:
      return category;
  }
}

export function BulkSendDialog({
  open,
  onOpenChange,
  selectedContactIds,
  selectedContactsCount,
  onSendComplete,
}: BulkSendDialogProps) {
  const {
    data: templatesData,
    error: templatesError,
    isLoading: templatesLoading,
    mutate: refreshTemplates,
  } = useSWR<{ templates: Template[]; error?: string }>(
    open ? "/api/crm/templates" : null,
    fetcher
  );

  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [campaignName, setCampaignName] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"select" | "confirm" | "result">("select");

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedTemplate(null);
      setCampaignName("");
      setResult(null);
      setError(null);
      setStep("select");
    }
  }, [open]);

  const approvedTemplates = (templatesData?.templates || []).filter(
    (t) => t.status === "APPROVED"
  );

  const handleSend = useCallback(async () => {
    if (!selectedTemplate) return;

    setSending(true);
    setError(null);

    try {
      // Build template components for variables
      const bodyComponent = selectedTemplate.components.find((c) => c.type === "BODY");
      const hasFirstnameVar =
        bodyComponent?.text?.includes("{{1}}") || bodyComponent?.text?.includes("{{firstname}}");

      const templateComponents = hasFirstnameVar
        ? [
            {
              type: "body",
              parameters: [{ type: "text", text: "{{firstname}}" }],
            },
          ]
        : [];

      const res = await fetch("/api/crm/bulk-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: selectedContactIds,
          templateName: selectedTemplate.name,
          templateLanguage: selectedTemplate.language,
          templateComponents,
          campaignName: campaignName || undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResult({ sent: data.sent, failed: data.failed, total: data.total });
        setStep("result");
        onSendComplete();
      } else {
        setError(data.error || "Erreur lors de l'envoi");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur reseau");
    } finally {
      setSending(false);
    }
  }, [selectedTemplate, selectedContactIds, campaignName, onSendComplete]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {step === "select" && "Choisir un template"}
            {step === "confirm" && "Confirmer l'envoi"}
            {step === "result" && "Resultat de l'envoi"}
          </DialogTitle>
          <DialogDescription>
            {step === "select" &&
              `Selectionnez un template WhatsApp approuve pour envoyer un message a ${selectedContactsCount} contact${selectedContactsCount > 1 ? "s" : ""}.`}
            {step === "confirm" &&
              "Verifiez les details avant de lancer l'envoi en masse."}
            {step === "result" && "Voici le resume de votre campagne."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1: Template selection */}
          {step === "select" && (
            <>
              {templatesLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">
                    Chargement des templates...
                  </span>
                </div>
              )}

              {templatesError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Impossible de charger les templates.
                    <Button
                      variant="link"
                      size="sm"
                      onClick={() => refreshTemplates()}
                      className="ml-1 h-auto p-0"
                    >
                      Reessayer
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {templatesData?.error && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {templatesData.error}
                  </AlertDescription>
                </Alert>
              )}

              {!templatesLoading && approvedTemplates.length === 0 && !templatesError && (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <MessageSquare className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-foreground">
                      Aucun template approuve
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Creez des templates dans votre{" "}
                      <a
                        href="https://business.facebook.com/wa/manage/message-templates/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        Meta Business Manager
                      </a>{" "}
                      et attendez leur approbation.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refreshTemplates()} className="gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Rafraichir
                  </Button>
                </div>
              )}

              {approvedTemplates.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">
                      {approvedTemplates.length} template{approvedTemplates.length > 1 ? "s" : ""}{" "}
                      disponible{approvedTemplates.length > 1 ? "s" : ""}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refreshTemplates()}
                      className="gap-1.5"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Rafraichir
                    </Button>
                  </div>

                  <ScrollArea className="h-[320px] pr-4">
                    <div className="space-y-2">
                      {approvedTemplates.map((template) => (
                        <button
                          key={`${template.name}-${template.language}`}
                          type="button"
                          onClick={() => setSelectedTemplate(template)}
                          className={`w-full rounded-lg border p-4 text-left transition-colors ${
                            selectedTemplate?.name === template.name &&
                            selectedTemplate?.language === template.language
                              ? "border-foreground bg-secondary"
                              : "border-border hover:border-foreground/20 hover:bg-secondary/50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {template.name}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${getStatusColor(template.status)}`}
                                >
                                  {template.status}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{getCategoryLabel(template.category)}</span>
                                <span>-</span>
                                <span>{template.language}</span>
                              </div>
                            </div>
                          </div>

                          {/* Template preview */}
                          <div className="mt-3 space-y-1.5">
                            {template.components.map((comp, idx) => (
                              <div key={idx} className="flex items-start gap-1.5">
                                <span className="mt-0.5 text-muted-foreground">
                                  {getFormatIcon(comp.format) || getComponentIcon(comp.type)}
                                </span>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {comp.text || `[${comp.type}${comp.format ? ` - ${comp.format}` : ""}]`}
                                </p>
                              </div>
                            ))}
                            {template.components.some((c) => c.buttons) &&
                              template.components
                                .filter((c) => c.buttons)
                                .flatMap((c) => c.buttons || [])
                                .map((btn, i) => (
                                  <Badge key={i} variant="secondary" className="text-[10px]">
                                    {btn.text}
                                  </Badge>
                                ))}
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </>
          )}

          {/* Step 2: Confirm */}
          {step === "confirm" && selectedTemplate && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/30 p-4">
                <h4 className="text-sm font-medium text-foreground">Resume</h4>
                <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Template</span>
                    <span className="font-medium text-foreground">
                      {selectedTemplate.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Langue</span>
                    <span className="font-medium text-foreground">
                      {selectedTemplate.language}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Categorie</span>
                    <span className="font-medium text-foreground">
                      {getCategoryLabel(selectedTemplate.category)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Destinataires</span>
                    <span className="font-medium text-foreground">
                      {selectedContactsCount} contact{selectedContactsCount > 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="campaign-name">Nom de la campagne (optionnel)</Label>
                <Input
                  id="campaign-name"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  placeholder={`Campagne ${new Date().toLocaleDateString("fr-FR")}`}
                />
              </div>

              <Alert className="border-amber-500/30 bg-amber-500/10">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-700">
                  <strong>Important :</strong> WhatsApp impose des regles strictes sur les messages
                  en masse. Seuls les templates approuves peuvent etre envoyes en dehors de la
                  fenetre de 24h. Un envoi abusif peut entrainer la suspension de votre compte.
                </AlertDescription>
              </Alert>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 3: Result */}
          {step === "result" && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-4">
                {result.failed === 0 ? (
                  <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                ) : result.sent === 0 ? (
                  <XCircle className="h-12 w-12 text-red-600" />
                ) : (
                  <AlertCircle className="h-12 w-12 text-amber-600" />
                )}
                <h3 className="text-lg font-semibold text-foreground">
                  {result.failed === 0
                    ? "Envoi termine avec succes !"
                    : result.sent === 0
                      ? "L'envoi a echoue"
                      : "Envoi partiellement termine"}
                </h3>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg border border-border p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">{result.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
                <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{result.sent}</p>
                  <p className="text-xs text-muted-foreground">Envoyes</p>
                </div>
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{result.failed}</p>
                  <p className="text-xs text-muted-foreground">Echoues</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button
                onClick={() => setStep("confirm")}
                disabled={!selectedTemplate}
                className="gap-2"
              >
                Continuer
              </Button>
            </>
          )}
          {step === "confirm" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Retour
              </Button>
              <Button onClick={handleSend} disabled={sending} className="gap-2">
                {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Send className="h-4 w-4" />
                {sending
                  ? "Envoi en cours..."
                  : `Envoyer a ${selectedContactsCount} contact${selectedContactsCount > 1 ? "s" : ""}`}
              </Button>
            </>
          )}
          {step === "result" && (
            <Button onClick={() => onOpenChange(false)}>Fermer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
