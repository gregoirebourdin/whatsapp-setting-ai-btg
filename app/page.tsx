"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfigPanel } from "@/components/dashboard/config-panel";
import { ConversationsPanel } from "@/components/dashboard/conversations-panel";
import { JobsPanel } from "@/components/dashboard/jobs-panel";
import { LogsPanel } from "@/components/dashboard/logs-panel";
import { StatusIndicator } from "@/components/dashboard/status-indicator";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState("config");

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                WhatsApp-Chatbase Bridge
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Admin Dashboard
              </p>
            </div>
            <StatusIndicator />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="conversations">Conversations</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4">
            <ConfigPanel />
          </TabsContent>

          <TabsContent value="conversations" className="space-y-4">
            <ConversationsPanel />
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <JobsPanel />
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <LogsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
