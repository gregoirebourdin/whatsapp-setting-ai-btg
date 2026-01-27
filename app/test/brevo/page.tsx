"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function TestBrevoPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTest = async () => {
    if (!phoneNumber.trim()) return;
    
    setIsLoading(true);
    setResult(null);
    
    try {
      const res = await fetch("/api/test/brevo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });
      
      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, message: "Network error" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8 flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Test Brevo API</CardTitle>
          <CardDescription>
            Test the Brevo contact update (CONTACTED = true)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input
              id="phone"
              placeholder="+33612345678 or 33612345678"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTest()}
            />
            <p className="text-xs text-muted-foreground">
              Format E.164 (avec ou sans le +)
            </p>
          </div>
          
          <Button 
            onClick={handleTest} 
            disabled={isLoading || !phoneNumber.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Update Contact in Brevo"
            )}
          </Button>
          
          {result && (
            <div className={`p-4 rounded-lg flex items-start gap-3 ${
              result.success 
                ? "bg-green-500/10 border border-green-500/20" 
                : "bg-red-500/10 border border-red-500/20"
            }`}>
              {result.success ? (
                <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
              )}
              <div>
                <p className={`font-medium ${result.success ? "text-green-500" : "text-red-500"}`}>
                  {result.success ? "Success" : "Failed"}
                </p>
                <p className="text-sm text-muted-foreground">{result.message}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
