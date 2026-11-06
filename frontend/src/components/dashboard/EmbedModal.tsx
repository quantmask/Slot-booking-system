import { useState } from 'react';
import { Code, X, Check, Copy } from 'lucide-react';

interface EmbedModalProps {
  hostSlug: string;
  eventSlug: string;
  onClose: () => void;
}

export default function EmbedModal({ hostSlug, eventSlug, onClose }: EmbedModalProps) {
  const [copiedEmbed, setCopiedEmbed] = useState(false);
  const snippet = `<iframe src="${window.location.origin}/embed/${hostSlug}/${eventSlug}" width="100%" height="700" frameborder="0"></iframe>`;

  const copyCode = () => {
    navigator.clipboard.writeText(snippet);
    setCopiedEmbed(true);
    setTimeout(() => setCopiedEmbed(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 shadow-xl animate-in zoom-in-95">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Code className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">Embed Booking Widget</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          Copy and paste this snippet into your website or React app to embed the booking interface directly:
        </p>

        <div className="p-3 bg-slate-900 text-slate-200 rounded-xl font-mono text-xs overflow-x-auto mb-4 border border-slate-800">
          {snippet}
        </div>

        <button
          onClick={copyCode}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
        >
          {copiedEmbed ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copiedEmbed ? 'Copied to Clipboard!' : 'Copy Embed Code'}</span>
        </button>
      </div>
    </div>
  );
}
