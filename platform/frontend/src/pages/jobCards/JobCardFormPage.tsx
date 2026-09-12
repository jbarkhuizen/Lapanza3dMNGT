import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { Checkbox } from '../../components/Checkbox.js';
import { ApiError } from '../../api/client.js';
import { useCustomers } from '../../api/customers.js';
import {
  useJobCard,
  useCreateJobCard,
  useUpdateJobCard,
  useCreateQuoteFromJobCard,
  JOB_CARD_TYPES,
  JOB_CARD_TYPE_LABELS,
  JOB_CARD_STATUSES,
  JOB_CARD_STATUS_LABELS,
  JOB_CARD_PRIORITIES,
  type JobCardType,
  type JobCardFormInput,
} from '../../api/jobCards.js';

function isJobCardType(value: string | null): value is JobCardType {
  return value !== null && (JOB_CARD_TYPES as readonly string[]).includes(value);
}

function emptyForm(cardType: JobCardType): JobCardFormInput {
  return {
    cardType,
    customerId: '',
    jobTitle: '',
    status: 'new',
    priority: 'normal',
    assignedTo: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    requiredBy: '',
    notes: '',
    terms: '',
    receivedBy: '',
  };
}

export function JobCardFormPage() {
  const { id } = useParams();
  const isEditMode = id !== undefined;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: existingCard, isLoading: isLoadingCard, isError: isCardError } = useJobCard(id);
  const { data: customers, isLoading: isLoadingCustomers } = useCustomers();
  const createMutation = useCreateJobCard();
  const updateMutation = useUpdateJobCard(id ?? '');
  const createQuoteMutation = useCreateQuoteFromJobCard(id ?? '');

  const requestedType = searchParams.get('type');
  const initialCardType: JobCardType = isJobCardType(requestedType) ? requestedType : 'repair';

  const [form, setForm] = useState<JobCardFormInput>(() => emptyForm(initialCardType));
  const [error, setError] = useState<string | null>(null);
  const populatedForIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (existingCard && populatedForIdRef.current !== id) {
      populatedForIdRef.current = id;
      setForm({
        cardType: existingCard.cardType,
        customerId: existingCard.customerId ?? '',
        jobTitle: existingCard.jobTitle,
        status: existingCard.status,
        priority: existingCard.priority,
        assignedTo: existingCard.assignedTo ?? '',
        receivedDate: existingCard.receivedDate.slice(0, 10),
        requiredBy: existingCard.requiredBy?.slice(0, 10) ?? '',
        notes: existingCard.notes ?? '',
        terms: existingCard.terms ?? '',
        receivedBy: existingCard.receivedBy ?? '',

        equipmentMake: existingCard.equipmentMake ?? '',
        equipmentModel: existingCard.equipmentModel ?? '',
        equipmentSerial: existingCard.equipmentSerial ?? '',
        reportedFault: existingCard.reportedFault ?? '',
        receivedWithPowerCord: existingCard.receivedWithPowerCord,
        receivedWithFilament: existingCard.receivedWithFilament,
        receivedWithBuildPlate: existingCard.receivedWithBuildPlate,
        receivedWithSdCard: existingCard.receivedWithSdCard,
        receivedWithTools: existingCard.receivedWithTools,
        receivedWithOther: existingCard.receivedWithOther ?? '',
        conditionPrintHead: existingCard.conditionPrintHead ?? '',
        conditionPrintBed: existingCard.conditionPrintBed ?? '',
        conditionExistingDamage: existingCard.conditionExistingDamage ?? '',
        technicianFindings: existingCard.technicianFindings ?? '',

        printFileName: existingCard.printFileName ?? '',
        printQuantity: existingCard.printQuantity ?? undefined,
        printWhatIsPrinted: existingCard.printWhatIsPrinted ?? '',
        printProcess: existingCard.printProcess ?? '',
        printMaterial: existingCard.printMaterial ?? '',
        printColour: existingCard.printColour ?? '',
        printQuality: existingCard.printQuality ?? '',
        finishRemoveSupports: existingCard.finishRemoveSupports,
        finishDeburrClean: existingCard.finishDeburrClean,
        finishSand: existingCard.finishSand,
        finishPrime: existingCard.finishPrime,
        finishPaint: existingCard.finishPaint,
        finishPostCure: existingCard.finishPostCure,
        finishInstallInserts: existingCard.finishInstallInserts,
        finishAssemble: existingCard.finishAssemble,
        resultQuantityAccepted: existingCard.resultQuantityAccepted ?? undefined,
        resultQuantityRejected: existingCard.resultQuantityRejected ?? undefined,
        resultNotes: existingCard.resultNotes ?? '',

        cadDesignType: existingCard.cadDesignType ?? '',
        cadWhatModelMustDo: existingCard.cadWhatModelMustDo ?? '',
        cadMaterial: existingCard.cadMaterial ?? '',
        cadIntendedProcess: existingCard.cadIntendedProcess ?? '',
        cadTolerances: existingCard.cadTolerances ?? '',
        cadCriticalDimensions: existingCard.cadCriticalDimensions ?? '',
        deliverableNativeCad: existingCard.deliverableNativeCad,
        deliverableStep: existingCard.deliverableStep,
        deliverableStl: existingCard.deliverableStl,
        deliverable3mf: existingCard.deliverable3mf,
        deliverableDxf: existingCard.deliverableDxf,
        deliverableDrawingPdf: existingCard.deliverableDrawingPdf,
        deliverableRenderedImages: existingCard.deliverableRenderedImages,
        cadApprovedRevision: existingCard.cadApprovedRevision ?? '',
      });
    }
  }, [existingCard, id]);

  function set<K extends keyof JobCardFormInput>(key: K, value: JobCardFormInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const cardType = form.cardType;

  // Only the shared fields plus the section matching this card's cardType
  // are sent -- the server's discriminated-union schema rejects a payload
  // carrying fields from a different type (see routes/job-cards.ts).
  function buildPayload(): JobCardFormInput {
    const shared: JobCardFormInput = {
      cardType,
      // '' means "no customer" in the <select> below. The create schema has
      // no nullable variant for customerId (blank must be omitted), while
      // the update schema does (blank must be sent as null to actually
      // clear a previously-set customer) -- see JobCardFormInput's comment.
      customerId: form.customerId ? form.customerId : isEditMode ? null : undefined,
      jobTitle: form.jobTitle,
      status: form.status,
      priority: form.priority,
      assignedTo: form.assignedTo,
      receivedDate: form.receivedDate,
      requiredBy: form.requiredBy ? form.requiredBy : isEditMode ? null : undefined,
      notes: form.notes,
      terms: form.terms,
      receivedBy: form.receivedBy,
    };
    if (cardType === 'repair') {
      return {
        ...shared,
        equipmentMake: form.equipmentMake,
        equipmentModel: form.equipmentModel,
        equipmentSerial: form.equipmentSerial,
        reportedFault: form.reportedFault,
        receivedWithPowerCord: form.receivedWithPowerCord,
        receivedWithFilament: form.receivedWithFilament,
        receivedWithBuildPlate: form.receivedWithBuildPlate,
        receivedWithSdCard: form.receivedWithSdCard,
        receivedWithTools: form.receivedWithTools,
        receivedWithOther: form.receivedWithOther,
        conditionPrintHead: form.conditionPrintHead,
        conditionPrintBed: form.conditionPrintBed,
        conditionExistingDamage: form.conditionExistingDamage,
        technicianFindings: form.technicianFindings,
      };
    }
    if (cardType === 'print') {
      return {
        ...shared,
        printFileName: form.printFileName,
        printQuantity: form.printQuantity,
        printWhatIsPrinted: form.printWhatIsPrinted,
        printProcess: form.printProcess,
        printMaterial: form.printMaterial,
        printColour: form.printColour,
        printQuality: form.printQuality,
        finishRemoveSupports: form.finishRemoveSupports,
        finishDeburrClean: form.finishDeburrClean,
        finishSand: form.finishSand,
        finishPrime: form.finishPrime,
        finishPaint: form.finishPaint,
        finishPostCure: form.finishPostCure,
        finishInstallInserts: form.finishInstallInserts,
        finishAssemble: form.finishAssemble,
        resultQuantityAccepted: form.resultQuantityAccepted,
        resultQuantityRejected: form.resultQuantityRejected,
        resultNotes: form.resultNotes,
      };
    }
    return {
      ...shared,
      cadDesignType: form.cadDesignType,
      cadWhatModelMustDo: form.cadWhatModelMustDo,
      cadMaterial: form.cadMaterial,
      cadIntendedProcess: form.cadIntendedProcess,
      cadTolerances: form.cadTolerances,
      cadCriticalDimensions: form.cadCriticalDimensions,
      deliverableNativeCad: form.deliverableNativeCad,
      deliverableStep: form.deliverableStep,
      deliverableStl: form.deliverableStl,
      deliverable3mf: form.deliverable3mf,
      deliverableDxf: form.deliverableDxf,
      deliverableDrawingPdf: form.deliverableDrawingPdf,
      deliverableRenderedImages: form.deliverableRenderedImages,
      cadApprovedRevision: form.cadApprovedRevision,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const payload = buildPayload();
      if (isEditMode) {
        const { cardType: _cardType, ...updatePayload } = payload;
        await updateMutation.mutateAsync(updatePayload);
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/job-cards');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  async function handleRaiseQuote() {
    setError(null);
    try {
      await createQuoteMutation.mutateAsync();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  if (isEditMode && isLoadingCard) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (isEditMode && isCardError) {
    return <p className="text-red-600">Couldn't load this job card. It may have been deleted.</p>;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <h1 className="text-2xl font-semibold text-slate-900">
        {isEditMode ? `Edit ${JOB_CARD_TYPE_LABELS[cardType]} Job Card` : `New ${JOB_CARD_TYPE_LABELS[cardType]} Job Card`}
      </h1>

      <div className="flex flex-col gap-1">
        <label htmlFor="customerId" className="text-sm font-medium text-slate-700">
          Customer
        </label>
        <select
          id="customerId"
          value={form.customerId ?? ''}
          onChange={(e) => set('customerId', e.target.value)}
          disabled={isLoadingCustomers}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">No customer</option>
          {customers?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <FormField id="jobTitle" label="Job title" value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} required />

      <div className="flex gap-4">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="status" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="status"
            value={form.status ?? 'new'}
            onChange={(e) => set('status', e.target.value as JobCardFormInput['status'])}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {JOB_CARD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_CARD_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="priority" className="text-sm font-medium text-slate-700">
            Priority
          </label>
          <select
            id="priority"
            value={form.priority ?? 'normal'}
            onChange={(e) => set('priority', e.target.value as JobCardFormInput['priority'])}
            className="rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {JOB_CARD_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p[0].toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <FormField
        id="assignedTo"
        label="Assigned to"
        value={form.assignedTo ?? ''}
        onChange={(e) => set('assignedTo', e.target.value)}
      />

      <div className="flex gap-4">
        <FormField
          id="receivedDate"
          label="Received date"
          type="date"
          value={form.receivedDate}
          onChange={(e) => set('receivedDate', e.target.value)}
          required
          className="flex-1"
        />
        <FormField
          id="requiredBy"
          label="Required by"
          type="date"
          value={form.requiredBy ?? ''}
          onChange={(e) => set('requiredBy', e.target.value)}
          className="flex-1"
        />
      </div>

      {cardType === 'repair' && (
        <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
          <h2 className="text-lg font-semibold text-slate-900">Repair details</h2>
          <div className="flex gap-4">
            <FormField id="equipmentMake" label="Make" value={form.equipmentMake ?? ''} onChange={(e) => set('equipmentMake', e.target.value)} className="flex-1" />
            <FormField id="equipmentModel" label="Model" value={form.equipmentModel ?? ''} onChange={(e) => set('equipmentModel', e.target.value)} className="flex-1" />
          </div>
          <FormField id="equipmentSerial" label="Serial number" value={form.equipmentSerial ?? ''} onChange={(e) => set('equipmentSerial', e.target.value)} />
          <TextareaField id="reportedFault" label="Reported fault" value={form.reportedFault ?? ''} onChange={(v) => set('reportedFault', v)} />
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700">Received with</legend>
            <Checkbox id="receivedWithPowerCord" label="Power cord" checked={!!form.receivedWithPowerCord} onChange={(v) => set('receivedWithPowerCord', v)} />
            <Checkbox id="receivedWithFilament" label="Filament" checked={!!form.receivedWithFilament} onChange={(v) => set('receivedWithFilament', v)} />
            <Checkbox id="receivedWithBuildPlate" label="Build plate" checked={!!form.receivedWithBuildPlate} onChange={(v) => set('receivedWithBuildPlate', v)} />
            <Checkbox id="receivedWithSdCard" label="SD card" checked={!!form.receivedWithSdCard} onChange={(v) => set('receivedWithSdCard', v)} />
            <Checkbox id="receivedWithTools" label="Tools" checked={!!form.receivedWithTools} onChange={(v) => set('receivedWithTools', v)} />
          </fieldset>
          <FormField id="receivedWithOther" label="Received with (other)" value={form.receivedWithOther ?? ''} onChange={(e) => set('receivedWithOther', e.target.value)} />
          <div className="flex gap-4">
            <FormField id="conditionPrintHead" label="Print head condition" value={form.conditionPrintHead ?? ''} onChange={(e) => set('conditionPrintHead', e.target.value)} className="flex-1" />
            <FormField id="conditionPrintBed" label="Print bed condition" value={form.conditionPrintBed ?? ''} onChange={(e) => set('conditionPrintBed', e.target.value)} className="flex-1" />
          </div>
          <TextareaField id="conditionExistingDamage" label="Existing damage" value={form.conditionExistingDamage ?? ''} onChange={(v) => set('conditionExistingDamage', v)} />
          <TextareaField id="technicianFindings" label="Technician findings" value={form.technicianFindings ?? ''} onChange={(v) => set('technicianFindings', v)} />
        </section>
      )}

      {cardType === 'print' && (
        <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
          <h2 className="text-lg font-semibold text-slate-900">Print details</h2>
          <FormField id="printFileName" label="File name" value={form.printFileName ?? ''} onChange={(e) => set('printFileName', e.target.value)} />
          <div className="flex gap-4">
            <FormField
              id="printQuantity"
              label="Quantity"
              type="number"
              value={form.printQuantity ?? ''}
              onChange={(e) => set('printQuantity', e.target.value === '' ? undefined : Number(e.target.value))}
              className="flex-1"
            />
            <FormField id="printMaterial" label="Material" value={form.printMaterial ?? ''} onChange={(e) => set('printMaterial', e.target.value)} className="flex-1" />
            <FormField id="printColour" label="Colour" value={form.printColour ?? ''} onChange={(e) => set('printColour', e.target.value)} className="flex-1" />
          </div>
          <TextareaField id="printWhatIsPrinted" label="What is being printed" value={form.printWhatIsPrinted ?? ''} onChange={(v) => set('printWhatIsPrinted', v)} />
          <div className="flex gap-4">
            <FormField id="printProcess" label="Process" value={form.printProcess ?? ''} onChange={(e) => set('printProcess', e.target.value)} className="flex-1" />
            <FormField id="printQuality" label="Quality" value={form.printQuality ?? ''} onChange={(e) => set('printQuality', e.target.value)} className="flex-1" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700">Finishing</legend>
            <Checkbox id="finishRemoveSupports" label="Remove supports" checked={!!form.finishRemoveSupports} onChange={(v) => set('finishRemoveSupports', v)} />
            <Checkbox id="finishDeburrClean" label="Deburr / clean" checked={!!form.finishDeburrClean} onChange={(v) => set('finishDeburrClean', v)} />
            <Checkbox id="finishSand" label="Sand" checked={!!form.finishSand} onChange={(v) => set('finishSand', v)} />
            <Checkbox id="finishPrime" label="Prime" checked={!!form.finishPrime} onChange={(v) => set('finishPrime', v)} />
            <Checkbox id="finishPaint" label="Paint" checked={!!form.finishPaint} onChange={(v) => set('finishPaint', v)} />
            <Checkbox id="finishPostCure" label="Post-cure" checked={!!form.finishPostCure} onChange={(v) => set('finishPostCure', v)} />
            <Checkbox id="finishInstallInserts" label="Install inserts" checked={!!form.finishInstallInserts} onChange={(v) => set('finishInstallInserts', v)} />
            <Checkbox id="finishAssemble" label="Assemble" checked={!!form.finishAssemble} onChange={(v) => set('finishAssemble', v)} />
          </fieldset>
          <div className="flex gap-4">
            <FormField
              id="resultQuantityAccepted"
              label="Quantity accepted"
              type="number"
              value={form.resultQuantityAccepted ?? ''}
              onChange={(e) => set('resultQuantityAccepted', e.target.value === '' ? undefined : Number(e.target.value))}
              className="flex-1"
            />
            <FormField
              id="resultQuantityRejected"
              label="Quantity rejected"
              type="number"
              value={form.resultQuantityRejected ?? ''}
              onChange={(e) => set('resultQuantityRejected', e.target.value === '' ? undefined : Number(e.target.value))}
              className="flex-1"
            />
          </div>
          <TextareaField id="resultNotes" label="Result notes" value={form.resultNotes ?? ''} onChange={(v) => set('resultNotes', v)} />
        </section>
      )}

      {cardType === 'cad' && (
        <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
          <h2 className="text-lg font-semibold text-slate-900">CAD details</h2>
          <div className="flex gap-4">
            <FormField id="cadDesignType" label="Design type" value={form.cadDesignType ?? ''} onChange={(e) => set('cadDesignType', e.target.value)} className="flex-1" />
            <FormField id="cadMaterial" label="Material" value={form.cadMaterial ?? ''} onChange={(e) => set('cadMaterial', e.target.value)} className="flex-1" />
          </div>
          <TextareaField id="cadWhatModelMustDo" label="What the model must do" value={form.cadWhatModelMustDo ?? ''} onChange={(v) => set('cadWhatModelMustDo', v)} />
          <FormField id="cadIntendedProcess" label="Intended manufacturing process" value={form.cadIntendedProcess ?? ''} onChange={(e) => set('cadIntendedProcess', e.target.value)} />
          <div className="flex gap-4">
            <FormField id="cadTolerances" label="Tolerances" value={form.cadTolerances ?? ''} onChange={(e) => set('cadTolerances', e.target.value)} className="flex-1" />
            <FormField id="cadCriticalDimensions" label="Critical dimensions" value={form.cadCriticalDimensions ?? ''} onChange={(e) => set('cadCriticalDimensions', e.target.value)} className="flex-1" />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-slate-700">Deliverables</legend>
            <Checkbox id="deliverableNativeCad" label="Native CAD file" checked={!!form.deliverableNativeCad} onChange={(v) => set('deliverableNativeCad', v)} />
            <Checkbox id="deliverableStep" label="STEP" checked={!!form.deliverableStep} onChange={(v) => set('deliverableStep', v)} />
            <Checkbox id="deliverableStl" label="STL" checked={!!form.deliverableStl} onChange={(v) => set('deliverableStl', v)} />
            <Checkbox id="deliverable3mf" label="3MF" checked={!!form.deliverable3mf} onChange={(v) => set('deliverable3mf', v)} />
            <Checkbox id="deliverableDxf" label="DXF" checked={!!form.deliverableDxf} onChange={(v) => set('deliverableDxf', v)} />
            <Checkbox id="deliverableDrawingPdf" label="Drawing PDF" checked={!!form.deliverableDrawingPdf} onChange={(v) => set('deliverableDrawingPdf', v)} />
            <Checkbox id="deliverableRenderedImages" label="Rendered images" checked={!!form.deliverableRenderedImages} onChange={(v) => set('deliverableRenderedImages', v)} />
          </fieldset>
          <FormField id="cadApprovedRevision" label="Approved revision" value={form.cadApprovedRevision ?? ''} onChange={(e) => set('cadApprovedRevision', e.target.value)} />
        </section>
      )}

      <section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
        <TextareaField id="notes" label="Notes" value={form.notes ?? ''} onChange={(v) => set('notes', v)} />
        <TextareaField id="terms" label="Terms" value={form.terms ?? ''} onChange={(v) => set('terms', v)} />
        <FormField id="receivedBy" label="Received by (signature)" value={form.receivedBy ?? ''} onChange={(e) => set('receivedBy', e.target.value)} />
      </section>

      {isEditMode && existingCard && (
        <section className="flex items-center gap-3 border-t border-slate-200 pt-4">
          {existingCard.quoteId ? (
            <Link to={`/quotes/${existingCard.quoteId}`} className="text-sm text-slate-600 underline">
              View quote
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleRaiseQuote}
              disabled={!existingCard.customerId || createQuoteMutation.isPending}
              className="rounded bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 disabled:opacity-50"
            >
              Raise a quote
            </button>
          )}
        </section>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Save
      </button>
    </form>
  );
}
