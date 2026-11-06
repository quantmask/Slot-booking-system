import { UserCheck } from 'lucide-react';

interface WaitlistTabProps {
  waitlists: any[];
}

export default function WaitlistTab({ waitlists }: WaitlistTabProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">Session Waitlists</h2>
        <p className="text-xs text-slate-500">
          Guests waiting for cancellations. The system automatically promotes the next person in line.
        </p>
      </div>

      {waitlists.length === 0 ? (
        <div className="p-10 text-center text-slate-500 bg-slate-50 border border-slate-200 rounded-2xl">
          <UserCheck className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <div className="font-semibold text-slate-700">No active waitlist entries</div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <th className="py-3 px-4">Guest</th>
                <th className="py-3 px-4">Session Target</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Requested At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {waitlists.map((w) => (
                <tr key={w.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-4 font-semibold text-slate-900">
                    {w.guest_name}
                    <div className="text-[11px] text-slate-500 font-normal">{w.guest_email}</div>
                  </td>
                  <td className="py-3.5 px-4 text-slate-700">{w.event_name}</td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        w.status === 'offered'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 font-mono">
                    {new Date(w.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

