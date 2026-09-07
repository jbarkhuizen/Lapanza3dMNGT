import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch } from './client.js';

export interface CompanyProfile {
  businessName: string;
  contactName: string;
  email: string;
  registrationNumber: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  phone: string | null;
  website: string | null;
  bankName: string | null;
  bankAccountHolder: string | null;
  bankAccountNumber: string | null;
  bankBranchCode: string | null;
  termsAndConditionsText: string | null;
  defaultCurrency: string;
  defaultQuoteValidityDays: number | null;
  quoteNumberPrefix: string;
  invoiceNumberPrefix: string;
}

export type UpdateCompanyProfileInput = Partial<Omit<CompanyProfile, 'email'>>;

const COMPANY_PROFILE_QUERY_KEY = ['companyProfile'] as const;

export function useCompanyProfile() {
  return useQuery({
    queryKey: COMPANY_PROFILE_QUERY_KEY,
    queryFn: () => apiGet<{ companyProfile: CompanyProfile }>('/api/company-profile').then((r) => r.companyProfile),
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateCompanyProfileInput) =>
      apiPatch<{ companyProfile: CompanyProfile }>('/api/company-profile', data).then((r) => r.companyProfile),
    onSuccess: (companyProfile) => {
      queryClient.setQueryData(COMPANY_PROFILE_QUERY_KEY, companyProfile);
    },
  });
}
