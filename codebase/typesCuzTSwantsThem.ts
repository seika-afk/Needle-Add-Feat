export interface ApolloFilters {
  person_titles?: string[];
  person_seniorities?: string[];
  organization_num_employees_ranges?: string[];
  person_locations?: string[];
  q_keywords?: string;
  per_page?: number;
  page?: number;
}

export interface ApolloOrganization {
  id: string;
  name: string;
}

export interface ApolloPerson {
  id: string;
  name: string;
  title?: string;
  organization?: ApolloOrganization;
  linkedin_url?: string;
  email?: string;
  email_status?: 'verified' | 'likely' | 'unverified' | string;
}
