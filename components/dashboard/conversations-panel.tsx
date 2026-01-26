"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertCircle,
  ChevronLeft,
  Loader2,
  MessageSquare,
  RefreshCw,
  User,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

// Types from Chatbase API
interface ChatbaseMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  type?: string;
}

interface ChatbaseConversation {
  id: string;
  chatbot_id: string;
  created_at: string;
  updated_at: string;
  source: string;
  messages: ChatbaseMessage[];
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}

interface ConversationsResponse {
  success: boolean;
  data: ChatbaseConversation[];
  error?: string;
}

interface ConversationDetailResponse {
  success: boolean;
  conversation: ChatbaseConversation;
  contact?: {
    name?: string;
    email?: string;
    phonenumber?: string;
  };
  error?: string;
}

export function ConversationsPanel() {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Fetch conversations directly from Chatbase API (via our proxy)
  const {
    data: convsData,
    error: convsError,
    isLoading: convsLoading,
    mutate: refreshConvs,
  } = useSWR<ConversationsResponse>("/api/chatbase/conversations", fetcher, {
    refreshInterval: 30000,
  });

  if (selectedId) {
    return (
      <ConversationDetail
        conversationId={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Conversations</CardTitle>
            <CardDescription>
              {convsData?.data?.length || 0} conversations from Chatbase
            </CardDescription>
          </div>
          <Button
            onClick={() => refreshConvs()}
            disabled={convsLoading}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {convsLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {convsError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load conversations from Chatbase
            </AlertDescription>
          </Alert>
        )}

        {convsLoading && !convsData && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        )}

        {convsData?.data && convsData.data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No conversations yet</p>
          </div>
        )}

        {convsData?.data && convsData.data.length > 0 && (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {convsData.data.map((conv) => {
                const lastMessage = conv.messages?.[conv.messages.length - 1];
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    className="w-full rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">
                            {conv.customer?.name || `Conversation`}
                          </p>
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {lastMessage?.content?.substring(0, 50) || "No messages"}
                            {(lastMessage?.content?.length || 0) > 50 && "..."}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2">
                        <Badge variant="outline" className="text-xs">
                          {conv.source}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(conv.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function ConversationDetail({
  conversationId,
  onBack,
}: {
  conversationId: string;
  onBack: () => void;
}) {
  const { data, error, isLoading } = useSWR<ConversationDetailResponse>(
    `/api/chatbase/conversations/${conversationId}`,
    fetcher
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-4 space-y-0">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          {isLoading ? (
            <Skeleton className="h-6 w-32" />
          ) : (
            <>
              <CardTitle>{data?.contact?.name || "Conversation"}</CardTitle>
              <CardDescription>
                {data?.contact?.phonenumber ||
                  data?.contact?.email ||
                  data?.conversation?.source ||
                  "Unknown"}
              </CardDescription>
            </>
          )}
        </div>
        {data?.conversation?.source && (
          <Badge variant="outline">{data.conversation.source}</Badge>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load conversation details
            </AlertDescription>
          </Alert>
        )}

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
              >
                <Skeleton className="h-16 w-64 rounded-lg" />
              </div>
            ))}
          </div>
        )}

        {data?.conversation?.messages && (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {data.conversation.messages.map((message, idx) => (
                <div
                  key={message.id || idx}
                  className={`flex ${message.role === "assistant" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      message.role === "assistant"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">
                      {message.content}
                    </p>
                    <div className="mt-1">
                      <span className="text-xs opacity-70">
                        {message.role === "user" ? "User" : "Bot"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {data?.contact && (data.contact.name || data.contact.email || data.contact.phonenumber) && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Contact Information</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {data.contact.name && (
                <div>
                  <span className="text-muted-foreground">Name:</span>{" "}
                  {data.contact.name}
                </div>
              )}
              {data.contact.email && (
                <div>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  {data.contact.email}
                </div>
              )}
              {data.contact.phonenumber && (
                <div>
                  <span className="text-muted-foreground">Phone:</span>{" "}
                  {data.contact.phonenumber}
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
