import { useState } from 'react';
import { Plus, Copy, Check, Code, ExternalLink } from 'lucide-react';

interface EventTypesTabProps {
  eventTypes: any[];
  hostSlug: string;
  onOpenCreateModal: () => void;
  onOpenEmbedModal: (slug: string) => void;
}

export default function EventTypesTab({
  eventTypes,
  hostSlug,
  onOpenCreateModal,
  onOpenEmbedModal,
}: EventTypesTabProps) {
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const copyEventLink = (slug: string) => {
    const url = `${window.location.origin}/${hostSlug}/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2000);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Event Types</h2>
          <p className="text-xs text-slate-500">Durations, buffer protection, and embed codes.</p>
        </div>
        <button
          onClick={onOpenCreateModal}
          className="px-3.5 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 flex items-center gap-1.5 transition"
        >
          <Plus className="w-4 h-4" /> New Event Type
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {eventTypes.map((et) => (
          <div
            key={et.id}
            className="p-5 border border-slate-200 rounded-2xl bg-white hover:border-slate-300 transition flex flex-col justify-between"
          >
            <div>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <h3 className="font-bold text-base text-slate-900">{et.name}</h3>
                  <p className="text-xs font-mono text-indigo-600">
                    /{hostSlug}/{et.slug}
                  </p>
                </div>
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">
                  {et.capacity === 1 ? '1 on 1' : `Group (${et.capacity})`}
                </span>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Duration</span>
                  <span className="font-bold text-slate-800">{et.duration_min} min</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Buffer After</span>
                  <span className="font-bold text-slate-800">{et.buffer_after_min} min</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Horizon</span>
                  <span className="font-bold text-slate-800">{et.horizon_days} days</span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyEventLink(et.slug)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 transition"
                >
                  {copiedSlug === et.slug ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedSlug === et.slug ? 'Copied' : 'Copy Link'}</span>
                </button>

                <button
                  onClick={() => onOpenEmbedModal(et.slug)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200 transition"
                >
                  <Code className="w-3.5 h-3.5" />
                  <span>Embed Widget</span>
                </button>
              </div>

              <a
                href={`/${hostSlug}/${et.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium"
              >
                <span>View Page</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

