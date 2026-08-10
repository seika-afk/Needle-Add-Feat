import 'dotenv/config'
import { ApolloFilters, ApolloPerson } from './typesCuzTSwantsThem';

const APOLLO_API_KEY = process.env.APOLLO_API_KEY
const url = "https://api.apollo.io/api/v1";

const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-cache',
  'x-api-key': APOLLO_API_KEY,
};



///---------------- API TO search people

export async function searchPeople(filters: ApolloFilters): Promise<ApolloPerson[]>{

  const body = {
    person_titles: filters.person_titles ?? [],
    person_seniorities: filters.person_seniorities ?? [],
    organization_num_employees_ranges: filters.organization_num_employees_ranges ?? [],
    person_locations: filters.person_locations ?? [],
    q_keywords: filters.q_keywords ?? '',
    per_page: filters.per_page ?? 10,
    page: filters.page ?? 1,
}

  const response = await fetch(`${url}/mixed_people/search`, {
    method: 'POST',
    headers,
    body:JSON.stringify(body)
  })
  if (!response.ok){
    throw new Error(await response.text())
  }
  const data= (await  response.json())  as {people?:ApolloPerson[]}
  return data.people ?? [];
}
export async function enrichPerson(personId: string): Promise<ApolloPerson>{


  const response = await fetch(`${url}/people/match`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ id: personId, reveal_personal_emails: false }),
  });

  if (!response.ok) {
    throw new Error(`Apollo enrich failed (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as { person: ApolloPerson };
  return data.person;

}
