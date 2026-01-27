import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

async function getConfig(key: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("config")
    .select("value")
    .eq("key", key)
    .single();
  return data?.value || null;
}

export async function POST(request: NextRequest) {
  try {
    const { phoneNumber } = await request.json();
    
    if (!phoneNumber) {
      return NextResponse.json({ 
        success: false, 
        message: "Phone number is required" 
      }, { status: 400 });
    }
    
    const apiKey = await getConfig("brevo_api_key");
    
    if (!apiKey) {
      return NextResponse.json({ 
        success: false, 
        message: "Brevo API key not configured. Add it in the Config tab." 
      }, { status: 400 });
    }
    
    // Format phone number with + prefix for Brevo (E.164 format)
    const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
    
    console.log(`[v0] Testing Brevo update for ${formattedPhone}`);
    
    // Use Option 2: identifier as phone number in URL
    const response = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(formattedPhone)}`,
      {
        method: "PUT",
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attributes: {
            ANSWERED: true,
          },
        }),
      }
    );
    
    console.log(`[v0] Brevo response status: ${response.status}`);
    
    if (response.status === 204) {
      return NextResponse.json({ 
        success: true, 
        message: `Contact ${formattedPhone} updated successfully. ANSWERED = true` 
      });
    } else if (response.status === 404) {
      return NextResponse.json({ 
        success: false, 
        message: `Contact not found in Brevo for ${formattedPhone}` 
      });
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.log(`[v0] Brevo error:`, errorData);
      return NextResponse.json({ 
        success: false, 
        message: `Brevo API error ${response.status}: ${errorData.message || JSON.stringify(errorData)}` 
      });
    }
  } catch (error) {
    console.error("[v0] Brevo test error:", error);
    return NextResponse.json({ 
      success: false, 
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}` 
    }, { status: 500 });
  }
}
