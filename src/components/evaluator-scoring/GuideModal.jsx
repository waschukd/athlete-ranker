"use client";

import { BookOpen, X } from "lucide-react";

export default function GuideModal({ guideData, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h3 className="font-display font-bold text-ink flex items-center gap-1.5"><BookOpen size={17} className="text-accent" /> Scoring guide {guideData?.age_tier && guideData.age_tier !== "ALL" ? `— ${guideData.age_tier}` : ""}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-4 space-y-5">
          {(guideData?.guide || []).filter(g => g.bands.length > 0).map(g => (
            <div key={g.scoring_category_id}>
              <h4 className="text-sm font-bold text-ink mb-1.5">{g.name}</h4>
              <div className="space-y-1">
                {g.bands.map((b, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="font-mono font-bold text-accent flex-shrink-0 w-10">{b.band_min}–{b.band_max}</span>
                    <span className="text-gray-600 leading-snug">{b.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
