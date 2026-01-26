"use client";

import { useState, useEffect, useCallback } from "react";
import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, Check, Loader2, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ConfigValue {
  value: string;
  masked: boolean;
  updated_at: string;
}

type ConfigData = Record<string, ConfigValue>;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function ConfigPanel() {
  const { data: config, error, mutate } = useSWR<ConfigData>("/api/config", fetcher);
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  // Initialize local values when config loads
  useEffect(() => {
    if (config) {
      const values: Record<string, string> = {};
      for (const [key, val] of Object.entries(config)) {
        if (!val.masked) {
          values[key] = val.value || "";
        }
      }
      setLocalValues(values);
    }
  }, [config]);

  const saveConfig = useCallback(async (key: string, value: string) => {
    setSaving(key);
    setSuccess(null);
    
    try {
      const response = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      
      if (response.ok) {
        setSuccess(key);
        mutate();
        setTimeout(() => setSuccess(null), 2000);
      }
    } catch (err) {
      console.error("Failed to save config:", err);
    } finally {
      setSaving(null);
    }
  }, [mutate]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load configuration</AlertDescription>
      </Alert>
    );
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* WhatsApp Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Configuration</CardTitle>
          <CardDescription>
            Configure your WhatsApp Business API credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone_number_id">Phone Number ID</Label>
            <div className="flex gap-2">
              <Input
                id="phone_number_id"
                value={localValues.whatsapp_phone_number_id || ""}
                onChange={(e) => setLocalValues(prev => ({ ...prev, whatsapp_phone_number_id: e.target.value }))}
                placeholder="Enter Phone Number ID"
              />
              <Button
                onClick={() => saveConfig("whatsapp_phone_number_id", localValues.whatsapp_phone_number_id || "")}
                disabled={saving === "whatsapp_phone_number_id"}
                size="icon"
                variant="outline"
              >
                {saving === "whatsapp_phone_number_id" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : success === "whatsapp_phone_number_id" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="access_token"
                  type={showSecrets.whatsapp_access_token ? "text" : "password"}
                  value={localValues.whatsapp_access_token || ""}
                  onChange={(e) => setLocalValues(prev => ({ ...prev, whatsapp_access_token: e.target.value }))}
                  placeholder={config.whatsapp_access_token?.value || "Enter Access Token"}
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({ ...prev, whatsapp_access_token: !prev.whatsapp_access_token }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecrets.whatsapp_access_token ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                onClick={() => saveConfig("whatsapp_access_token", localValues.whatsapp_access_token || "")}
                disabled={saving === "whatsapp_access_token" || !localValues.whatsapp_access_token}
                size="icon"
                variant="outline"
              >
                {saving === "whatsapp_access_token" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : success === "whatsapp_access_token" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verify_token">Webhook Verify Token</Label>
            <div className="flex gap-2">
              <Input
                id="verify_token"
                value={localValues.whatsapp_verify_token || ""}
                onChange={(e) => setLocalValues(prev => ({ ...prev, whatsapp_verify_token: e.target.value }))}
                placeholder="Enter Verify Token"
              />
              <Button
                onClick={() => saveConfig("whatsapp_verify_token", localValues.whatsapp_verify_token || "")}
                disabled={saving === "whatsapp_verify_token"}
                size="icon"
                variant="outline"
              >
                {saving === "whatsapp_verify_token" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : success === "whatsapp_verify_token" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Chatbase Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Chatbase Configuration</CardTitle>
          <CardDescription>
            Configure your Chatbase chatbot credentials
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chatbot_id">Chatbot ID</Label>
            <div className="flex gap-2">
              <Input
                id="chatbot_id"
                value={localValues.chatbase_chatbot_id || ""}
                onChange={(e) => setLocalValues(prev => ({ ...prev, chatbase_chatbot_id: e.target.value }))}
                placeholder="Enter Chatbot ID"
              />
              <Button
                onClick={() => saveConfig("chatbase_chatbot_id", localValues.chatbase_chatbot_id || "")}
                disabled={saving === "chatbase_chatbot_id"}
                size="icon"
                variant="outline"
              >
                {saving === "chatbase_chatbot_id" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : success === "chatbase_chatbot_id" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="chatbase_api_key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="chatbase_api_key"
                  type={showSecrets.chatbase_api_key ? "text" : "password"}
                  value={localValues.chatbase_api_key || ""}
                  onChange={(e) => setLocalValues(prev => ({ ...prev, chatbase_api_key: e.target.value }))}
                  placeholder={config.chatbase_api_key?.value || "Enter API Key"}
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(prev => ({ ...prev, chatbase_api_key: !prev.chatbase_api_key }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecrets.chatbase_api_key ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button
                onClick={() => saveConfig("chatbase_api_key", localValues.chatbase_api_key || "")}
                disabled={saving === "chatbase_api_key" || !localValues.chatbase_api_key}
                size="icon"
                variant="outline"
              >
                {saving === "chatbase_api_key" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : success === "chatbase_api_key" ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Send Mode Configuration */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Message Send Mode</CardTitle>
          <CardDescription>
            Choose how AI responses are sent to users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup
            value={localValues.send_mode || config.send_mode?.value || "normal"}
            onValueChange={(value) => {
              setLocalValues(prev => ({ ...prev, send_mode: value }));
              saveConfig("send_mode", value);
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="flex items-start space-x-3 rounded-lg border border-border p-4">
              <RadioGroupItem value="normal" id="normal" className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="normal" className="font-medium cursor-pointer">Normal Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Send AI responses as regular text messages. Works within the 24-hour conversation window.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border border-border p-4">
              <RadioGroupItem value="template" id="template" className="mt-1" />
              <div className="space-y-1">
                <Label htmlFor="template" className="font-medium cursor-pointer">Template Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Send AI responses as template messages. Required outside the 24-hour window.
                </p>
              </div>
            </div>
          </RadioGroup>

          {(localValues.send_mode || config.send_mode?.value) === "template" && (
            <div className="grid gap-4 pt-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="template_name">Template Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="template_name"
                    value={localValues.template_name || ""}
                    onChange={(e) => setLocalValues(prev => ({ ...prev, template_name: e.target.value }))}
                    placeholder="e.g., ai_response"
                  />
                  <Button
                    onClick={() => saveConfig("template_name", localValues.template_name || "")}
                    disabled={saving === "template_name"}
                    size="icon"
                    variant="outline"
                  >
                    {saving === "template_name" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : success === "template_name" ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="template_language">Template Language</Label>
                <div className="flex gap-2">
                  <Input
                    id="template_language"
                    value={localValues.template_language || ""}
                    onChange={(e) => setLocalValues(prev => ({ ...prev, template_language: e.target.value }))}
                    placeholder="e.g., en"
                  />
                  <Button
                    onClick={() => saveConfig("template_language", localValues.template_language || "")}
                    disabled={saving === "template_language"}
                    size="icon"
                    variant="outline"
                  >
                    {saving === "template_language" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : success === "template_language" ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
