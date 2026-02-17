import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createAdminClient();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { contacts } = body;

  if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
    return NextResponse.json({ error: 'contacts array is required' }, { status: 400 });
  }

  // Validate and normalize each contact
  const validContacts = [];
  const errors: string[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const { firstname, phone } = contacts[i];

    if (!firstname || !phone) {
      errors.push(`Row ${i + 1}: firstname and phone are required`);
      continue;
    }

    // Normalize phone: remove spaces, dashes, parentheses, dots
    let normalizedPhone = phone.toString().replace(/[\s\-().]/g, '');

    // Convert 00XX to +XX format
    if (normalizedPhone.startsWith('00') && normalizedPhone.length > 10) {
      normalizedPhone = '+' + normalizedPhone.slice(2);
    }
    // French local numbers: 06/07 -> +336/+337
    if (/^0[67]/.test(normalizedPhone) && normalizedPhone.length === 10) {
      normalizedPhone = '+33' + normalizedPhone.slice(1);
    }
    // Ensure + prefix for international
    if (!normalizedPhone.startsWith('+') && normalizedPhone.length > 10) {
      normalizedPhone = '+' + normalizedPhone;
    }

    if (normalizedPhone.replace(/\+/g, '').length < 8) {
      errors.push(`Ligne ${i + 1}: numero trop court (${normalizedPhone})`);
      continue;
    }

    validContacts.push({
      firstname: firstname.trim(),
      phone: normalizedPhone,
      tags: [],
      updated_at: new Date().toISOString(),
    });
  }

  if (validContacts.length === 0) {
    return NextResponse.json(
      { error: 'No valid contacts found', details: errors },
      { status: 400 }
    );
  }

  // Upsert in batches of 100
  const batchSize = 100;
  let imported = 0;
  let updated = 0;

  for (let i = 0; i < validContacts.length; i += batchSize) {
    const batch = validContacts.slice(i, i + batchSize);

    // Check which phones already exist
    const phones = batch.map((c) => c.phone);
    const { data: existing } = await supabase
      .from('crm_contacts')
      .select('phone')
      .in('phone', phones);

    const existingPhones = new Set((existing || []).map((e) => e.phone));
    const newInBatch = batch.filter((c) => !existingPhones.has(c.phone)).length;
    const updatedInBatch = batch.length - newInBatch;

    const { error } = await supabase
      .from('crm_contacts')
      .upsert(batch, { onConflict: 'phone' });

    if (error) {
      errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      continue;
    }

    imported += newInBatch;
    updated += updatedInBatch;
  }

  return NextResponse.json({
    success: true,
    imported,
    updated,
    total: validContacts.length,
    errors: errors.length > 0 ? errors : undefined,
  });
}
