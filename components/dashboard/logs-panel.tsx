"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertCircle, Loader2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { EventLog } from "@/lib/types";

interface LogsResponse {
  logs: EventLog[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const eventTypes = [
  "all",
  "webhook_received",
  "message_received",
  "chatbase_response_sent",
  "status_update",
  "job_failed",
  "webhook_signature_invalid",
  "mapping_create_error",
];

export function LogsPanel() {
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("all");
  const [selectedLog, setSelectedLog] = useState<EventLog | null>(null);

  const { data, error, isLoading, mutate } = useSWR<LogsResponse>(
    `/api/logs?limit=100${eventTypeFilter !== "all" ? `&event_type=${eventTypeFilter}` : ""}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const getEventBadge = (eventType: string) => {
    const isError = eventType.includes("error") || eventType.includes("failed") || eventType.includes("invalid");
    const isSuccess = eventType.includes("sent") || eventType.includes("received");
    
    if (isError) {
      return <Badge variant="destructive">{eventType}</Badge>;
    }
    if (isSuccess) {
      return <Badge variant="default" className="bg-green-600 text-white hover:bg-green-600">{eventType}</Badge>;
    }
    return <Badge variant="secondary">{eventType}</Badge>;
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load logs</AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Event Logs</CardTitle>
              <CardDescription>
                System events and webhook activity
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by type" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type === "all" ? "All Events" : type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => mutate()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.logs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No logs found
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {data?.logs?.map((log) => (
                  <button
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {getEventBadge(log.event_type)}
                        {log.wa_id && (
                          <span className="text-sm text-muted-foreground">
                            +{log.wa_id}
                          </span>
                        )}
                        {log.error && (
                          <span className="truncate text-sm text-destructive">
                            {log.error}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Event Details</DialogTitle>
            <DialogDescription>
              {selectedLog?.event_type} - {selectedLog && new Date(selectedLog.created_at).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium">Event Type</h4>
                {getEventBadge(selectedLog.event_type)}
              </div>
              
              {selectedLog.wa_id && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">WhatsApp ID</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    +{selectedLog.wa_id}
                  </p>
                </div>
              )}
              
              {selectedLog.job_id && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Job ID</h4>
                  <p className="text-sm text-muted-foreground font-mono">
                    {selectedLog.job_id}
                  </p>
                </div>
              )}
              
              {selectedLog.error && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">Error</h4>
                  <p className="text-sm text-destructive">
                    {selectedLog.error}
                  </p>
                </div>
              )}
              
              {selectedLog.payload && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Payload</h4>
                  <ScrollArea className="h-64 rounded-lg border border-border bg-muted p-4">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.payload, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
