"use client";

import { useState } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Loader2, Play, RefreshCw } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useJobPoller } from "@/hooks/use-job-poller";

interface Job {
  id: string;
  wa_id: string;
  status: string;
  scheduled_for: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  contact_name: string | null;
}

interface JobsResponse {
  jobs: Job[];
  total: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function JobsPanel() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<{ processed: number; errors: number } | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(true);

  const { data, error, isLoading, mutate } = useSWR<JobsResponse>(
    `/api/jobs?limit=50${statusFilter !== "all" ? `&status=${statusFilter}` : ""}`,
    fetcher,
    { refreshInterval: 5000 }
  );

  const { isPolling } = useJobPoller({
    enabled: pollingEnabled,
    intervalMs: 5000,
    onProcess: (result) => {
      if (result.processed > 0) {
        setProcessResult(result);
        mutate();
      }
    },
  });

  const triggerProcessing = async () => {
    setProcessing(true);
    setProcessResult(null);
    
    try {
      const response = await fetch("/api/jobs/process", { method: "POST" });
      const result = await response.json();
      setProcessResult(result);
      mutate();
    } catch (err) {
      console.error("Failed to process jobs:", err);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
      pending: { variant: "secondary" },
      processing: { variant: "default", className: "bg-blue-600 text-white hover:bg-blue-600" },
      completed: { variant: "default", className: "bg-green-600 text-white hover:bg-green-600" },
      failed: { variant: "destructive" },
    };
    const config = variants[status] || { variant: "outline" as const };
    return <Badge variant={config.variant} className={config.className}>{status}</Badge>;
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load jobs</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Job Queue</CardTitle>
              <CardDescription>
                Scheduled Chatbase response jobs
              </CardDescription>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="polling"
                  checked={pollingEnabled}
                  onCheckedChange={setPollingEnabled}
                />
                <Label htmlFor="polling" className="flex items-center gap-1.5">
                  {isPolling && (
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                  )}
                  Auto-process
                </Label>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => mutate()}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button onClick={triggerProcessing} disabled={processing}>
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Process Now
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {processResult && (
            <Alert className="mb-4">
              <AlertDescription>
                Processed {processResult.processed} jobs with {processResult.errors} errors
              </AlertDescription>
            </Alert>
          )}
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : data?.jobs?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No jobs found
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled For</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.jobs?.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">
                          {job.contact_name || "Unknown"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          +{job.wa_id}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(job.status)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">
                          {new Date(job.scheduled_for).toLocaleDateString()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(job.scheduled_for).toLocaleTimeString()}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>{job.attempts}</TableCell>
                    <TableCell>
                      {job.last_error && (
                        <p className="max-w-xs truncate text-sm text-destructive">
                          {job.last_error}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
