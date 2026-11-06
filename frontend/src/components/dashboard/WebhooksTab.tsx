import { useState } from 'react';

interface WebhooksTabProps {
  webhooks: any[];
  webhookLogs: any[];
  onRegisterWebhook: (url: string) => Promise<void>;
}

export default function WebhooksTab({
  webhooks,
  webhookLogs,
  onRegisterWebhook,
}: WebhooksTabProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copiedSecret, setCopiedSecret] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookUrl.trim()) return;
    await onRegisterWebhook(webhookUrl);
    setWebhookUrl('');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      <div>
        <h2 className="text-base font-bold text-slate-900">
          Custom Webhooks & HMAC Signatures
        </h2>
        <p className="text-xs text-slate-500">
          Receive signed booking events directly to your endpoint with cryptographic SHA-256 HMAC verification.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-5 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-3"
      >
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Register Endpoint
        </h3>
        <div className="flex gap-2">
          <input
            type="url"
            required
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://api.yourdomain.com/webhooks/slotbook"
            className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-slate-900 focus:outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold transition"
          >
            Register Webhook
          </button>
        </div>
      </form>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
          Configured Endpoints
        </h3>
        {webhooks.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No webhooks registered.</p>
        ) : (
          <div className="space-y-3">
            {webhooks.map((wh) => (
              <div
                key={wh.id}
                className="p-4 border border-slate-200 rounded-xl bg-white space-y-2"
              >
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-900 font-mono">{wh.url}</span>
                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-full text-[10px]">
                    Active
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="text-[11px] font-semibold text-slate-600">HMAC Secret:</span>
                  <code className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px] text-slate-800">
                    {wh.secret_key}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(wh.secret_key);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                    className="text-indigo-600 hover:text-indigo-800 text-[11px] font-medium"
                  >
                    {copiedSecret ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
          Recent Delivery Log
        </h3>
        {webhookLogs.length === 0 ? (
          <p className="text-xs text-slate-400 italic">No webhook attempts recorded yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Latency</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {webhookLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 font-mono text-[11px]">
                    <td className="py-2.5 px-3 font-semibold text-slate-800">
                      {log.event_type}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          log.status_code === 200
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {log.status_code || 'Error'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      {log.delivery_duration_ms}ms
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

