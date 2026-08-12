
export interface TombaEmailResult {
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  position?: string;
  department?: string;
  company?: string;
  score?: number;
  verification?: { status?: string };
  phone_number?: string;
  linkedin?: string;
  sources?: { uri: string }[];
}

export interface DomainSearchResult {
  organization?: {
    website_url?: string;
    organization?: string;
    industry?: string;
  };
  emails: TombaEmailResult[];
}
