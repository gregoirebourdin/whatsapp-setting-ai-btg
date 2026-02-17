"use client";

import { useState, useCallback, useMemo } from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertCircle,
  Loader2,
  Search,
  Send,
  Trash2,
  Users,
  MessageSquare,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CsvImportDialog } from "./csv-import-dialog";
import { AddContactDialog } from "./add-contact-dialog";
import { BulkSendDialog } from "./bulk-send-dialog";

interface Contact {
  id: string;
  firstname: string;
  phone: string;
  tags: string[];
  notes: string | null;
  opted_in: boolean;
  created_at: string;
  updated_at: string;
}

interface ContactsResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface Campaign {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

interface CampaignsResponse {
  campaigns: Campaign[];
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error("Erreur lors du chargement des donnees");
    throw error;
  }
  return res.json();
};

function getCampaignStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">Termine</Badge>;
    case "sending":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 border-blue-500/20">En cours</Badge>;
    case "failed":
      return <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/20">Echoue</Badge>;
    case "draft":
      return <Badge variant="outline" className="bg-secondary text-secondary-foreground">Brouillon</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function CrmPanel() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeView, setActiveView] = useState<"contacts" | "campaigns">("contacts");

  const {
    data: contactsData,
    error: contactsError,
    isLoading: contactsLoading,
    mutate: refreshContacts,
  } = useSWR<ContactsResponse>(
    `/api/crm/contacts?page=${page}&limit=25&search=${encodeURIComponent(search)}`,
    fetcher,
    { keepPreviousData: true }
  );

  const {
    data: campaignsData,
    mutate: refreshCampaigns,
  } = useSWR<CampaignsResponse>(
    "/api/crm/campaigns",
    fetcher,
    { revalidateOnFocus: false }
  );

  const contacts = contactsData?.contacts || [];
  const totalContacts = contactsData?.total || 0;
  const totalPages = contactsData?.totalPages || 1;
  const campaigns = campaignsData?.campaigns || [];

  const allSelected = useMemo(
    () => contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id)),
    [contacts, selectedIds]
  );

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    }
  }, [allSelected, contacts]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const [selectingAll, setSelectingAll] = useState(false);
  const selectAll = useCallback(async () => {
    // Fetch ALL contact IDs from the server (not just current page)
    setSelectingAll(true);
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/crm/contacts?page=1&limit=10000${searchParam}`);
      const data = await res.json();
      if (data.contacts) {
        setSelectedIds(new Set(data.contacts.map((c: Contact) => c.id)));
      }
    } catch {
      // Fallback: just select current page
      setSelectedIds(new Set(contacts.map((c) => c.id)));
    } finally {
      setSelectingAll(false);
    }
  }, [contacts, search]);

  const handleDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(
      `Supprimer ${selectedIds.size} contact${selectedIds.size > 1 ? "s" : ""} ?`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await fetch("/api/crm/contacts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      refreshContacts();
    } catch (err) {
      console.error("Delete error:", err);
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, refreshContacts]);

  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearch(e.target.value);
      setPage(1);
      setSelectedIds(new Set());
    },
    []
  );

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <Users className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{totalContacts}</p>
              <p className="text-xs text-muted-foreground">Contacts totaux</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <MessageSquare className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{campaigns.length}</p>
              <p className="text-xs text-muted-foreground">Campagnes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
              <TrendingUp className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">
                {campaigns.reduce((acc, c) => acc + c.sent_count, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Messages envoyes</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setActiveView("contacts")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeView === "contacts"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="mr-2 inline-block h-4 w-4" />
          Contacts
        </button>
        <button
          type="button"
          onClick={() => { setActiveView("campaigns"); refreshCampaigns(); }}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeView === "campaigns"
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Send className="mr-2 inline-block h-4 w-4" />
          Campagnes
        </button>
      </div>

      {/* Contacts view */}
      {activeView === "contacts" && (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Contacts CRM</CardTitle>
                <CardDescription>
                  Gerez vos contacts WhatsApp. Importez un CSV ou ajoutez manuellement.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <CsvImportDialog onImportComplete={() => { refreshContacts(); setSelectedIds(new Set()); }} />
                <AddContactDialog onContactAdded={() => { refreshContacts(); }} />
              </div>
            </div>

            {/* Search + bulk actions */}
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={handleSearchChange}
                  placeholder="Rechercher par nom ou telephone..."
                  className="pl-9"
                />
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {selectedIds.size} selectionne{selectedIds.size > 1 ? "s" : ""}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-600"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Supprimer
                  </Button>
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setBulkDialogOpen(true)}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Envoyer un DM
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {contactsError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Erreur lors du chargement des contacts.</AlertDescription>
              </Alert>
            )}

            {contactsLoading && contacts.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!contactsLoading && contacts.length === 0 && !search && (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Aucun contact pour le moment
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Commencez par importer vos contacts depuis un fichier CSV ou ajoutez-les
                    manuellement. Le CSV doit contenir deux colonnes : prenom et telephone.
                  </p>
                </div>
                <div className="flex gap-2">
                  <CsvImportDialog onImportComplete={() => refreshContacts()} />
                  <AddContactDialog onContactAdded={() => refreshContacts()} />
                </div>
              </div>
            )}

            {!contactsLoading && contacts.length === 0 && search && (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <Search className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Aucun contact ne correspond a &quot;{search}&quot;
                </p>
              </div>
            )}

            {contacts.length > 0 && (
              <>
                {/* Select all banner */}
                {allSelected && totalContacts > contacts.length && selectedIds.size < totalContacts && (
                  <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-secondary/50 p-2 text-sm">
                    <span className="text-muted-foreground">
                      Les {contacts.length} contacts de cette page sont selectionnes.
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={selectAll}
                      disabled={selectingAll}
                    >
                      {selectingAll ? (
                        <>
                          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                          Chargement...
                        </>
                      ) : (
                        `Selectionner les ${totalContacts} contacts`
                      )}
                    </Button>
                  </div>
                )}
                {selectedIds.size > contacts.length && (
                  <div className="mb-3 flex items-center justify-center gap-2 rounded-lg bg-secondary/50 p-2 text-sm">
                    <span className="font-medium text-foreground">
                      {selectedIds.size} contacts selectionnes sur toutes les pages.
                    </span>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Tout deselectionner
                    </Button>
                  </div>
                )}

                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allSelected}
                            onCheckedChange={toggleAll}
                            aria-label="Tout selectionner"
                          />
                        </TableHead>
                        <TableHead>Prenom</TableHead>
                        <TableHead>Telephone</TableHead>
                        <TableHead className="hidden sm:table-cell">Opt-in</TableHead>
                        <TableHead className="hidden md:table-cell">Ajoute le</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {contacts.map((contact) => (
                        <TableRow
                          key={contact.id}
                          className={selectedIds.has(contact.id) ? "bg-secondary/50" : ""}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(contact.id)}
                              onCheckedChange={() => toggleOne(contact.id)}
                              aria-label={`Selectionner ${contact.firstname}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {contact.firstname}
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {contact.phone}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {contact.opted_in ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                              >
                                Oui
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-red-500/10 text-red-700 border-red-500/20"
                              >
                                Non
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                            {new Date(contact.created_at).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {page} sur {totalPages} ({totalContacts} contacts)
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => { setPage((p) => p - 1); setSelectedIds(new Set()); }}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => { setPage((p) => p + 1); setSelectedIds(new Set()); }}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Campaigns view */}
      {activeView === "campaigns" && (
        <Card>
          <CardHeader>
            <CardTitle>Historique des campagnes</CardTitle>
            <CardDescription>
              Retrouvez l'historique de vos envois en masse avec les statistiques de chaque campagne.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                  <Send className="h-8 w-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    Aucune campagne
                  </h3>
                  <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                    Selectionnez des contacts dans l'onglet Contacts puis cliquez sur &quot;Envoyer
                    un DM&quot; pour lancer votre premiere campagne.
                  </p>
                </div>
                <Button variant="outline" onClick={() => setActiveView("contacts")}>
                  Aller aux contacts
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campagne</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Envoyes</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">Echoues</TableHead>
                      <TableHead className="hidden md:table-cell">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell className="font-medium text-foreground">
                          {campaign.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {campaign.template_name}
                        </TableCell>
                        <TableCell>{getCampaignStatusBadge(campaign.status)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {campaign.sent_count}/{campaign.total_recipients}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-red-600 hidden sm:table-cell">
                          {campaign.failed_count > 0 ? campaign.failed_count : "-"}
                        </TableCell>
                        <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            {new Date(campaign.created_at).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Bulk Send Dialog */}
      <BulkSendDialog
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        selectedContactIds={Array.from(selectedIds)}
        selectedContactsCount={selectedIds.size}
        onSendComplete={() => {
          refreshContacts();
          refreshCampaigns();
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
