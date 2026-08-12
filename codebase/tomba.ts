import 'dotenv/config'
import { DomainSearchResult } from './typesCuzTSwantsThem';

const TOMBA_KEY = process.env.TOMBA_KEY;
const TOMBA_SECRET = process.env.TOMBA_SECRET;
const BASE_URL = 'https://api.tomba.io/v1';

if (!TOMBA_KEY || !TOMBA_SECRET) {
  throw new Error('TOMBA_KEY and/or TOMBA_SECRET is not set in .env file')
}

const headers = {
  'Content-Type': 'application/json',
  'X-Tomba-Key': TOMBA_KEY,
  'X-Tomba-Secret': TOMBA_SECRET
}


// ----------------- TOMBA RELATED APIS


export async function domainSearch(domain: string, opts: { company?: string; page?: number } = {}):Promise<DomainSearchResult> {

  const params = new URLSearchParams({ domain })
  if (opts.company) params.set('company', opts.company)
  if (opts.page) params.set('page', String(opts.page))



    const response = await fetch(`${BASE_URL}/domain-search?${params.toString()}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Tomba domain-search failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as { data: DomainSearchResult };
    return data.data;

}

//



export async function verifyEmail(email: string): Promise<{ email: string; valid: boolean; status?: string }> {
  const query = new URLSearchParams({ email });

  const response = await fetch(`${BASE_URL}/email-verifier?${query.toString()}`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Tomba email-verifier failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { data: { email: string; valid: boolean; status?: string } };
  return data.data;
}
