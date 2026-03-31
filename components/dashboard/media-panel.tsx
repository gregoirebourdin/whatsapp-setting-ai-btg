"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Upload,
  FileImage,
  FileVideo,
  FileAudio,
  FileText,
  Copy,
  Check,
  Loader2,
  AlertCircle,
  Trash2,
  Image,
  Film,
  Music,
  File,
  RefreshCw,
} from "lucide-react";

interface TemplateWithMedia {
  name: string;
  status: string;
  language: string;
  headerFormat: string;
  headerHandle: string;
}

interface UploadedMedia {
  id: string;
  mediaId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  mediaType: string;
  uploadedAt: Date;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMediaIcon(mediaType: string) {
  switch (mediaType) {
    case "image":
      return Image;
    case "video":
      return Film;
    case "audio":
      return Music;
    default:
      return File;
  }
}

function getMediaColor(mediaType: string) {
  switch (mediaType) {
    case "image":
      return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
    case "video":
      return "bg-purple-500/10 text-purple-600 border-purple-500/20";
    case "audio":
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default:
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  }
}

export function MediaPanel() {
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedMedia[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Templates with media
  const [templatesWithMedia, setTemplatesWithMedia] = useState<TemplateWithMedia[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);

  const fetchTemplatesWithMedia = useCallback(async () => {
    setLoadingTemplates(true);
    setTemplatesError(null);

    try {
      const res = await fetch("/api/crm/templates");
      const data = await res.json();

      if (data.error) {
        setTemplatesError(data.error);
        return;
      }

      // Filter templates that have media headers
      const mediaTemplates: TemplateWithMedia[] = [];
      
      for (const template of data.templates || []) {
        const headerComp = template.components?.find(
          (c: { type: string }) => c.type === "HEADER"
        );
        
        if (headerComp && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerComp.format)) {
          // Get the header handle from example
          const headerHandle = headerComp.example?.header_handle?.[0] || null;
          
          if (headerHandle) {
            mediaTemplates.push({
              name: template.name,
              status: template.status,
              language: template.language,
              headerFormat: headerComp.format,
              headerHandle,
            });
          }
        }
      }

      setTemplatesWithMedia(mediaTemplates);
    } catch (err) {
      setTemplatesError(err instanceof Error ? err.message : "Erreur reseau");
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  // Load templates on mount
  useEffect(() => {
    fetchTemplatesWithMedia();
  }, [fetchTemplatesWithMedia]);

  const handleUpload = useCallback(async (file: File) => {
    // Vercel limit is 4.5MB
    const VERCEL_LIMIT = 4.5 * 1024 * 1024;
    if (file.size > VERCEL_LIMIT) {
      setError(
        `Fichier trop volumineux (${formatFileSize(file.size)}). ` +
        `Limite: 4.5 MB. Pour les gros fichiers, creez directement votre template ` +
        `sur Meta Business Suite avec le media integre.`
      );
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        setError(`Erreur serveur: ${text.slice(0, 100)}`);
        return;
      }

      const data = await res.json();

      if (res.ok && data.success) {
        const newMedia: UploadedMedia = {
          id: crypto.randomUUID(),
          mediaId: data.mediaId,
          fileName: data.fileName,
          fileSize: data.fileSize,
          fileType: data.fileType,
          mediaType: data.mediaType,
          uploadedAt: new Date(),
        };
        setUploadedFiles((prev) => [newMedia, ...prev]);
      } else {
        setError(data.error || "Erreur lors de l'upload");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur reseau");
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleUpload(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleUpload]
  );

  const copyToClipboard = useCallback(async (mediaId: string) => {
    try {
      await navigator.clipboard.writeText(mediaId);
      setCopiedId(mediaId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = mediaId;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedId(mediaId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }, []);

  const removeFile = useCallback((id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  return (
    <div className="space-y-6">
      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle>Upload de media</CardTitle>
          <CardDescription>
            Uploadez des fichiers vers WhatsApp pour obtenir leur Media ID (max 4.5 MB).
            Pour les fichiers plus gros, creez le template directement sur Meta Business Suite.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative flex flex-col items-center justify-center gap-4 rounded-lg border-2 border-dashed p-8 transition-colors ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/50"
            } ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/aac,audio/mp4,audio/mpeg,audio/amr,audio/ogg,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain"
              onChange={handleFileChange}
              disabled={uploading}
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Upload en cours...</p>
              </div>
            ) : (
              <>
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Glissez un fichier ici ou cliquez pour selectionner
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Images, Videos, Audio, Documents - Max 4.5 MB
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Formats info */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
              <FileImage className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">Images</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
              <FileVideo className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">Videos</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
              <FileAudio className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">Audio</span>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-border p-2.5">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">Documents</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fichiers uploades</CardTitle>
            <CardDescription>
              Copiez le Media ID pour l'utiliser dans vos templates ou messages.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {uploadedFiles.map((file) => {
                  const Icon = getMediaIcon(file.mediaType);
                  const colorClass = getMediaColor(file.mediaType);

                  return (
                    <div
                      key={file.id}
                      className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${colorClass}`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {file.fileName}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {file.mediaType}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {formatFileSize(file.fileSize)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5">
                          <code className="text-xs font-mono text-foreground">
                            {file.mediaId}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => copyToClipboard(file.mediaId)}
                          >
                            {copiedId === file.mediaId ? (
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFile(file.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Templates with media */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Media des templates</CardTitle>
              <CardDescription>
                Recuperez les Media Handles de vos templates qui ont un header media.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchTemplatesWithMedia}
              disabled={loadingTemplates}
              className="gap-2"
            >
              {loadingTemplates ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Actualiser
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {templatesError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{templatesError}</AlertDescription>
            </Alert>
          )}

          {loadingTemplates && templatesWithMedia.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingTemplates && templatesWithMedia.length === 0 && !templatesError && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                <FileImage className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Aucun template avec media</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Creez un template avec un header Image/Video/Document sur Meta Business Suite.
                </p>
              </div>
            </div>
          )}

          {templatesWithMedia.length > 0 && (
            <ScrollArea className="max-h-[300px]">
              <div className="space-y-3">
                {templatesWithMedia.map((template) => (
                  <div
                    key={`${template.name}-${template.language}`}
                    className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-lg border ${
                        template.headerFormat === "IMAGE" 
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : template.headerFormat === "VIDEO"
                          ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                          : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                      }`}>
                        {template.headerFormat === "IMAGE" && <Image className="h-5 w-5" />}
                        {template.headerFormat === "VIDEO" && <Film className="h-5 w-5" />}
                        {template.headerFormat === "DOCUMENT" && <File className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {template.name}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge 
                            variant="secondary" 
                            className={`text-xs ${
                              template.status === "APPROVED" 
                                ? "bg-emerald-500/10 text-emerald-600" 
                                : "bg-amber-500/10 text-amber-600"
                            }`}
                          >
                            {template.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {template.language} - {template.headerFormat}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 max-w-[200px] sm:max-w-[300px]">
                        <code className="text-xs font-mono text-foreground truncate">
                          {template.headerHandle}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0"
                          onClick={() => copyToClipboard(template.headerHandle)}
                        >
                          {copiedId === template.headerHandle ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pour les gros fichiers (&gt;4.5 MB)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Creez directement votre template avec le media sur <strong className="text-foreground">Meta Business Suite</strong> :
          </p>
          <ol className="list-decimal list-inside space-y-1 ml-2">
            <li>Allez sur <code className="rounded bg-secondary px-1 py-0.5 text-xs">business.facebook.com</code></li>
            <li>WhatsApp Manager → Outils de compte → Templates</li>
            <li>Creez un template avec Header de type Media</li>
            <li>Le media sera integre directement dans le template</li>
          </ol>
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Les Media IDs expirent apres <strong>30 jours</strong>. Les medias integres dans les templates n'expirent pas.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
