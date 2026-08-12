import { generateTargets } from "./filterGen"
import { matchesRole } from "./helpers"
import { domainSearch } from "./tomba"


export const run = async (prompt: string) => {
  console.log("========STARTING=======")
  console.log("== STAGE 1 : Searching for companies related to Query")
  const targets = await generateTargets(prompt)

  console.log("-- Searched")
  console.log('\nTarget companies:', targets.target_companies);
  console.log('Reasoning:', targets.reasoning);

  console.log("== STAGE 2 : Searching for people in the domains..")
  const candidates = [];
  for (const company of targets.target_companies) {
    try {
      const result = await domainSearch(company.domain, {
        company: company.name
      });
      const matched = result.emails

        .filter((e) => matchesRole(e, targets.role_keywords))
        .map((e) => ({ ...e, companyDomain: company.domain }));
      candidates.push(...matched);

    }
    catch (err) {
          console.warn(`  (skipped ${company.domain}: ${(err as Error).message})`);
        }
      }


    if (candidates.length === 0) {
      console.log('\nNo candidates found. Try a broader prompt or different companies.');
      return null;
    }
  console.log("-- Searched People in Domains")
  console.log(candidates)

}

const query = "Find me some emails of flipkart company"
run(query)
