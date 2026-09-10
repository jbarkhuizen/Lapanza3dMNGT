import { useCompanyProfile } from '../api/companyProfile.js';

/**
 * Resolves the tenant's configured display currency (CompanyProfile.defaultCurrency)
 * for use with `formatCurrency`. Returns `undefined` while the profile is still
 * loading or unavailable, letting `formatCurrency`'s own ZAR default apply — never
 * hardcode 'ZAR' at a call site, thread this hook through instead (backlog #59).
 */
export function useDisplayCurrency(): string | undefined {
  const { data: companyProfile } = useCompanyProfile();
  return companyProfile?.defaultCurrency;
}
