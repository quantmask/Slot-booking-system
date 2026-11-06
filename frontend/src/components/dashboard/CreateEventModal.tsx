import { useState } from 'react';
import { X } from 'lucide-react';

interface CreateEventModalProps {
  onClose: () => void;
  onCreate: (eventData: {
    name: string;
    slug: string;
    duration_min: number;
    capacity: number;
    buffer_before_min: number;
    buffer_after_min: number;
    min_notice_hours: number;
    horizon_days: number;
  }) => Promise<void>;
}

export default function CreateEventModal({
  onClose,
  onCreate,
}: CreateEventModalProps) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [capacity, setCapacity] = useState(1);
  const [bufferBeforeMin] = useState(0);
  const [bufferAfterMin, setBufferAfterMin] = useState(15);
  const [minNoticeHours] = useState(4);
  const [horizonDays] = useState(30);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onCreate({
      name,
      slug,
      duration_min: durationMin,
      capacity,
      buffer_before_min: bufferBeforeMin,
      buffer_after_min: bufferAfterMin,
      min_notice_hours: minNoticeHours,
      horizon_days: horizonDays,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-900 text-base">Create Event Type</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Event Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Technical Interview"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
              }}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Slug</label>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Duration (min)</label>
              <input
                type="number"
                required
                min="5"
                max="480"
                value={durationMin}
                onChange={(e) => setDurationMin(parseInt(e.target.value, 10) || 30)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Capacity</label>
              <input
                type="number"
                required
                min="1"
                max="100"
                value={capacity}
                onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Buffer After (min)</label>
              <input
                type="number"
                required
                min="0"
                max="120"
                value={bufferAfterMin}
                onChange={(e) => setBufferAfterMin(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 bg-slate-900 text-white font-semibold rounded-xl hover:bg-slate-800 transition"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
