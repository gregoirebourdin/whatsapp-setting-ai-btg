"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Check, ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
}

interface WABAResponse {
  data: PhoneNumber[];
}

export default function WhatsAppSetupPage() {
  const [accessToken, setAccessToken] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const fetchPhoneNumbers = async () => {
    if (!accessToken || !wabaId) {
      setError("Please enter both Access Token and WABA ID");
      return;
    }

    setLoading(true);
    setError(null);
    setPhoneNumbers([]);

    try {
      // Call Meta Graph API to get phone numbers
      const response = await fetch(
        `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers?access_token=${accessToken}`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || `API Error: ${response.status}`);
      }

      const data: WABAResponse = await response.json();
      setPhoneNumbers(data.data || []);

      if (data.data?.length === 0) {
        setError("No phone numbers found for this WABA ID");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch phone numbers");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const saveToConfig = async (phoneNumberId: string) => {
    try {
      const response = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "whatsapp_phone_number_id",
          value: phoneNumberId,
        }),
      });

      if (!response.ok) throw new Error("Failed to save");

      // Also save the access token
      await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "whatsapp_token",
          value: accessToken,
        }),
      });

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError("Failed to save to config");
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>WhatsApp Setup</CardTitle>
            <CardDescription>
              Retrieve your WhatsApp Phone Number ID from the Meta Graph API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Instructions */}
            <Alert>
              <AlertDescription>
                <p className="mb-2 font-medium">How to get your credentials:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>
                    Go to{" "}
                    <a
                      href="https://developers.facebook.com/apps"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline inline-flex items-center gap-1"
                    >
                      Meta for Developers <ExternalLink className="h-3 w-3" />
                    </a>
                  </li>
                  <li>Select your app and go to WhatsApp {">"} API Setup</li>
                  <li>Copy your <strong>Temporary Access Token</strong></li>
                  <li>Copy your <strong>WhatsApp Business Account ID</strong> (WABA ID)</li>
                </ol>
              </AlertDescription>
            </Alert>

            {/* Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <Input
                  id="accessToken"
                  type="password"
                  placeholder="EAAxxxxxxxx..."
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="wabaId">WhatsApp Business Account ID (WABA ID)</Label>
                <Input
                  id="wabaId"
                  placeholder="123456789012345"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                />
              </div>

              <Button onClick={fetchPhoneNumbers} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Fetching...
                  </>
                ) : (
                  "Get Phone Numbers"
                )}
              </Button>
            </div>

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Success message */}
            {saved && (
              <Alert className="border-green-500 bg-green-500/10">
                <AlertDescription className="text-green-600">
                  Configuration saved successfully!
                </AlertDescription>
              </Alert>
            )}

            {/* Results */}
            {phoneNumbers.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-medium">Your Phone Numbers:</h3>
                {phoneNumbers.map((phone) => (
                  <Card key={phone.id} className="bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="font-mono text-lg">{phone.display_phone_number}</p>
                          <p className="text-sm text-muted-foreground">{phone.verified_name}</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Phone Number ID:</span>
                            <code className="rounded bg-muted px-2 py-0.5 text-xs font-mono">
                              {phone.id}
                            </code>
                          </div>
                          <Badge
                            variant={phone.quality_rating === "GREEN" ? "default" : "secondary"}
                            className="mt-2"
                          >
                            Quality: {phone.quality_rating}
                          </Badge>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyToClipboard(phone.id)}
                          >
                            {copiedId === phone.id ? (
                              <>
                                <Check className="mr-1 h-3 w-3" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="mr-1 h-3 w-3" />
                                Copy ID
                              </>
                            )}
                          </Button>
                          <Button size="sm" onClick={() => saveToConfig(phone.id)}>
                            Save to Config
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
