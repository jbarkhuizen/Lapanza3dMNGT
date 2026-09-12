import { useState, type FormEvent } from 'react';
import { FormField } from '../../components/FormField.js';
import { TextareaField } from '../../components/TextareaField.js';
import { ApiError } from '../../api/client.js';
import {
  useMyFeatureRequests,
  useCommunityFeatureRequests,
  useSubmitFeatureRequest,
  useToggleFeatureRequestVote,
  type FeatureRequestCategory,
  type FeatureRequestStatus,
  type CommunityFeatureRequest,
} from '../../api/featureRequests.js';

const CATEGORIES: FeatureRequestCategory[] = ['new_feature', 'workflow', 'bug'];

const CATEGORY_LABELS: Record<FeatureRequestCategory, string> = {
  new_feature: 'New Feature',
  workflow: 'Workflow',
  bug: 'Bug',
};

const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  new: 'New',
  planned: 'Planned',
  in_progress: 'In Progress',
  done: 'Done',
  declined: 'Declined',
};

function StatusBadge({ status }: { status: FeatureRequestStatus }) {
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
      {STATUS_LABELS[status]}
    </span>
  );
}

function SubmitFeatureRequestForm() {
  const submitMutation = useSubmitFeatureRequest();
  const [category, setCategory] = useState<FeatureRequestCategory>('new_feature');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await submitMutation.mutateAsync({ category, title, description });
      setCategory('new_feature');
      setTitle('');
      setDescription('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again shortly.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Submit a request</h2>
      <div className="flex flex-col gap-1">
        <label htmlFor="category" className="text-sm font-medium text-slate-700">Category</label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value as FeatureRequestCategory)}
          className="rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <FormField
        id="title"
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        required
      />
      <TextareaField id="description" label="Description" value={description} onChange={setDescription} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={submitMutation.isPending}
        className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        Submit request
      </button>
    </form>
  );
}

function MyFeatureRequestsSection() {
  const { data: myRequests, isLoading, isError } = useMyFeatureRequests();

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">My requests</h2>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load your requests. Try refreshing the page.</p>}
      {!isLoading && !isError && myRequests?.length === 0 && <p className="text-slate-500">No requests yet.</p>}
      {!isLoading && !isError && myRequests && myRequests.length > 0 && (
        <ul className="flex flex-col gap-3">
          {myRequests.map((request) => (
            <li key={request.id} className="flex flex-col gap-1 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{request.title}</span>
                <StatusBadge status={request.status} />
              </div>
              <span className="text-xs text-slate-500">{CATEGORY_LABELS[request.category]}</span>
              <p className="text-sm text-slate-600">{request.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommunityRequestRow({ request }: { request: CommunityFeatureRequest }) {
  const toggleVoteMutation = useToggleFeatureRequestVote(request.id);

  return (
    <li className="flex items-start gap-4 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0">
      <button
        type="button"
        onClick={() => toggleVoteMutation.mutate()}
        disabled={toggleVoteMutation.isPending}
        aria-pressed={request.hasVoted}
        aria-label={request.hasVoted ? `Remove vote for ${request.title}` : `Vote for ${request.title}`}
        className={`flex w-14 flex-col items-center rounded border px-2 py-1 text-sm font-medium disabled:opacity-50 ${
          request.hasVoted
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 text-slate-700 hover:bg-slate-100'
        }`}
      >
        <span aria-hidden="true">▲</span>
        <span>{request.voteCount}</span>
      </button>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-slate-900">{request.title}</span>
          <StatusBadge status={request.status} />
        </div>
        <span className="text-xs text-slate-500">{CATEGORY_LABELS[request.category]}</span>
        <p className="text-sm text-slate-600">{request.description}</p>
      </div>
    </li>
  );
}

function CommunityFeatureRequestsSection() {
  const { data: communityRequests, isLoading, isError } = useCommunityFeatureRequests('votes');
  const [view, setView] = useState<'vote' | 'upcoming'>('vote');

  const visibleRequests =
    view === 'upcoming'
      ? (communityRequests ?? []).filter((request) => request.status !== 'new')
      : (communityRequests ?? []);

  return (
    <div className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Community requests</h2>
        <div className="flex gap-1 rounded bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setView('vote')}
            className={`rounded px-3 py-1 ${view === 'vote' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Vote
          </button>
          <button
            type="button"
            onClick={() => setView('upcoming')}
            className={`rounded px-3 py-1 ${view === 'upcoming' ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'}`}
          >
            Upcoming
          </button>
        </div>
      </div>
      {isLoading && <p className="text-slate-500">Loading…</p>}
      {isError && <p className="text-red-600">Couldn't load community requests. Try refreshing the page.</p>}
      {!isLoading && !isError && visibleRequests.length === 0 && (
        <p className="text-slate-500">
          {view === 'upcoming' ? 'Nothing planned yet.' : 'No community requests yet.'}
        </p>
      )}
      {!isLoading && !isError && visibleRequests.length > 0 && (
        <ul className="flex flex-col gap-3">
          {visibleRequests.map((request) => (
            <CommunityRequestRow key={request.id} request={request} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function FeatureRequestsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-slate-900">Feature Requests</h1>
      <SubmitFeatureRequestForm />
      <MyFeatureRequestsSection />
      <CommunityFeatureRequestsSection />
    </div>
  );
}
