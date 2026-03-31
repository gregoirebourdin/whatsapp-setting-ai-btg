"use client";

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";

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

  const handleUpload = useCallback(async (file: File) => {
    // Vercel serverless has a 4.5MB body size limit - no way around it without Blob storage
    const VERCEL_LIMIT = 4.5 * 1024 * 1024; // 4.5MB
    if (file.size > VERCEL_LIMIT) {
      setError(
        `Fichier trop volumineux (${formatFileSize(file.size)}). ` +
        `Limite serveur: 4.5 MB. Pour les fichiers plus gros, uploadez directement sur ` +
        `Meta Business Suite: business.facebook.com → WhatsApp Manager → Outils → Media.`
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

      // Handle non-JSON responses (like "Request Entity Too Large")
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        if (text.includes("Request Entity Too Large") || text.includes("413") || text.includes("FUNCTION_PAYLOAD_TOO_LARGE")) {
          setError(
            "Fichier trop volumineux pour le serveur (limite 4.5 MB). " +
            "Pour les gros fichiers: business.facebook.com → WhatsApp Manager → Outils → Media."
          );
        } else {
          setError(`Erreur serveur: ${text.slice(0, 100)}`);
        }
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
      // Reset input
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
      // Fallback for older browsers
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
            Uploadez des fichiers vers WhatsApp pour obtenir leur Media ID.
            Les Media IDs expirent apres 30 jours.
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
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Upload en cours...</p>
              </>
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
                    Images (JPEG, PNG, WebP) - Videos (MP4, 3GPP) - Audio (AAC, MP3, OGG) - Documents (PDF, Word, Excel)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Max 4.5 MB (limite Vercel)
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

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Comment utiliser les Media IDs ?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">1.</strong> Uploadez votre fichier ci-dessus pour obtenir un Media ID.
          </p>
          <p>
            <strong className="text-foreground">2.</strong> Copiez le Media ID (ex: <code className="rounded bg-secondary px-1 py-0.5 text-xs font-mono">123456789012345</code>).
          </p>
          <p>
            <strong className="text-foreground">3.</strong> Utilisez-le dans vos templates WhatsApp avec header media, ou dans l'API pour envoyer des messages avec pieces jointes.
          </p>
          <Alert className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Les Media IDs expirent apres <strong>30 jours</strong>. Pensez a re-uploader vos fichiers si necessaire.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
