"use client";

import useSWR from "swr";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface ConfigValue {
  value: string;
  masked: boolean;
  updated_at: string;
}

type ConfigData = Record<string, ConfigValue>;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function StatusIndicator() {
  const { data: config, isLoading } = useSWR<ConfigData>("/api/config", fetcher, {
    refreshInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const hasWhatsApp = config?.whatsapp_phone_number_id?.value && config?.whatsapp_access_token?.value;
  const hasChatbase = config?.chatbase_chatbot_id?.value && config?.chatbase_api_key?.value;
  const isConfigured = hasWhatsApp && hasChatbase;

  return (
    <div className="flex items-center gap-3">
      <Badge variant={hasWhatsApp ? "default" : "secondary"} className={hasWhatsApp ? "bg-green-600 text-white hover:bg-green-600" : ""}>
        WhatsApp {hasWhatsApp ? "Connected" : "Not Configured"}
      </Badge>
      <Badge variant={hasChatbase ? "default" : "secondary"} className={hasChatbase ? "bg-green-600 text-white hover:bg-green-600" : ""}>
        Chatbase {hasChatbase ? "Connected" : "Not Configured"}
      </Badge>
      {isConfigured && (
        <Badge variant="outline" className="border-green-600 text-green-600">
          Ready
        </Badge>
      )}
    </div>
  );
}
