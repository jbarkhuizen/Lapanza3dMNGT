import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPatch, apiPost } from './client.js';

export const JOB_CARD_TYPES = ['repair', 'print', 'cad'] as const;
export type JobCardType = (typeof JOB_CARD_TYPES)[number];

export const JOB_CARD_TYPE_LABELS: Record<JobCardType, string> = {
  repair: 'Repair',
  print: 'Print job',
  cad: 'CAD job',
};

export const JOB_CARD_STATUSES = ['new', 'in_progress', 'done', 'cancelled'] as const;
export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

export const JOB_CARD_STATUS_LABELS: Record<JobCardStatus, string> = {
  new: 'New',
  in_progress: 'In progress',
  done: 'Done',
  cancelled: 'Cancelled',
};

export const JOB_CARD_PRIORITIES = ['low', 'normal', 'high'] as const;
export type JobCardPriority = (typeof JOB_CARD_PRIORITIES)[number];

export interface JobCard {
  id: string;
  number: string;
  cardType: JobCardType;
  customerId: string | null;
  jobTitle: string;
  status: JobCardStatus;
  priority: JobCardPriority;
  assignedTo: string | null;
  receivedDate: string;
  requiredBy: string | null;
  notes: string | null;
  terms: string | null;
  receivedBy: string | null;
  quoteId: string | null;
  createdAt: string;

  // Repair
  equipmentMake: string | null;
  equipmentModel: string | null;
  equipmentSerial: string | null;
  reportedFault: string | null;
  receivedWithPowerCord: boolean;
  receivedWithFilament: boolean;
  receivedWithBuildPlate: boolean;
  receivedWithSdCard: boolean;
  receivedWithTools: boolean;
  receivedWithOther: string | null;
  conditionPrintHead: string | null;
  conditionPrintBed: string | null;
  conditionExistingDamage: string | null;
  technicianFindings: string | null;

  // Print
  printFileName: string | null;
  printQuantity: number | null;
  printWhatIsPrinted: string | null;
  printProcess: string | null;
  printMaterial: string | null;
  printColour: string | null;
  printQuality: string | null;
  finishRemoveSupports: boolean;
  finishDeburrClean: boolean;
  finishSand: boolean;
  finishPrime: boolean;
  finishPaint: boolean;
  finishPostCure: boolean;
  finishInstallInserts: boolean;
  finishAssemble: boolean;
  resultQuantityAccepted: number | null;
  resultQuantityRejected: number | null;
  resultNotes: string | null;

  // CAD
  cadDesignType: string | null;
  cadWhatModelMustDo: string | null;
  cadMaterial: string | null;
  cadIntendedProcess: string | null;
  cadTolerances: string | null;
  cadCriticalDimensions: string | null;
  deliverableNativeCad: boolean;
  deliverableStep: boolean;
  deliverableStl: boolean;
  deliverable3mf: boolean;
  deliverableDxf: boolean;
  deliverableDrawingPdf: boolean;
  deliverableRenderedImages: boolean;
  cadApprovedRevision: string | null;
}

export interface JobCardStats {
  dueSoon: number;
  awaitingQuote: number;
  quoted: number;
  invoiced: number;
}

// Every field is optional except the shared cardType/jobTitle/receivedDate
// required by every card, so one input type covers create for all three
// cardTypes — the form page only sends the fields for the type it renders.
export interface JobCardFormInput {
  cardType: JobCardType;
  // string to set, null to explicitly clear (PATCH only -- the create
  // schema has no nullable variant for this field, so the form only ever
  // sends null when editing), omitted to leave untouched.
  customerId?: string | null;
  jobTitle: string;
  status?: JobCardStatus;
  priority?: JobCardPriority;
  assignedTo?: string;
  receivedDate: string;
  // Same string | null | omitted three-state as customerId above.
  requiredBy?: string | null;
  notes?: string;
  terms?: string;
  receivedBy?: string;

  // Repair
  equipmentMake?: string;
  equipmentModel?: string;
  equipmentSerial?: string;
  reportedFault?: string;
  receivedWithPowerCord?: boolean;
  receivedWithFilament?: boolean;
  receivedWithBuildPlate?: boolean;
  receivedWithSdCard?: boolean;
  receivedWithTools?: boolean;
  receivedWithOther?: string;
  conditionPrintHead?: string;
  conditionPrintBed?: string;
  conditionExistingDamage?: string;
  technicianFindings?: string;

  // Print
  printFileName?: string;
  printQuantity?: number;
  printWhatIsPrinted?: string;
  printProcess?: string;
  printMaterial?: string;
  printColour?: string;
  printQuality?: string;
  finishRemoveSupports?: boolean;
  finishDeburrClean?: boolean;
  finishSand?: boolean;
  finishPrime?: boolean;
  finishPaint?: boolean;
  finishPostCure?: boolean;
  finishInstallInserts?: boolean;
  finishAssemble?: boolean;
  resultQuantityAccepted?: number;
  resultQuantityRejected?: number;
  resultNotes?: string;

  // CAD
  cadDesignType?: string;
  cadWhatModelMustDo?: string;
  cadMaterial?: string;
  cadIntendedProcess?: string;
  cadTolerances?: string;
  cadCriticalDimensions?: string;
  deliverableNativeCad?: boolean;
  deliverableStep?: boolean;
  deliverableStl?: boolean;
  deliverable3mf?: boolean;
  deliverableDxf?: boolean;
  deliverableDrawingPdf?: boolean;
  deliverableRenderedImages?: boolean;
  cadApprovedRevision?: string;
}

const JOB_CARDS_QUERY_KEY = ['jobCards'] as const;
const JOB_CARD_STATS_QUERY_KEY = [...JOB_CARDS_QUERY_KEY, 'stats'] as const;

export function useJobCards() {
  return useQuery({
    queryKey: JOB_CARDS_QUERY_KEY,
    queryFn: () => apiGet<{ jobCards: JobCard[] }>('/api/job-cards').then((r) => r.jobCards),
  });
}

export function useJobCardStats() {
  return useQuery({
    queryKey: JOB_CARD_STATS_QUERY_KEY,
    queryFn: () => apiGet<{ ok: true } & JobCardStats>('/api/job-cards/stats'),
  });
}

export function useJobCard(id: string | undefined) {
  return useQuery({
    queryKey: [...JOB_CARDS_QUERY_KEY, id],
    queryFn: () => apiGet<{ jobCard: JobCard }>(`/api/job-cards/${id}`).then((r) => r.jobCard),
    enabled: id !== undefined,
  });
}

export function useCreateJobCard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: JobCardFormInput) =>
      apiPost<{ jobCard: JobCard }>('/api/job-cards', data).then((r) => r.jobCard),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOB_CARDS_QUERY_KEY });
    },
  });
}

export function useUpdateJobCard(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<JobCardFormInput>) =>
      apiPatch<{ jobCard: JobCard }>(`/api/job-cards/${id}`, data).then((r) => r.jobCard),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOB_CARDS_QUERY_KEY });
    },
  });
}

export function useCreateQuoteFromJobCard(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<{ quote: { id: string } }>(`/api/job-cards/${id}/create-quote`).then((r) => r.quote),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: JOB_CARDS_QUERY_KEY });
    },
  });
}
