import type { Citation } from "../../atoms/chatAtom";

interface CitationBadgeProps {
  citation: Citation;
}

export function CitationBadge({ citation }: CitationBadgeProps) {
  const handleClick = () => {
    if (citation.type === "web" && citation.url) {
      window.open(citation.url, "_blank", "noopener,noreferrer");
    } else if (citation.type === "pdf" && citation.pageNumber) {
      // Scroll to the page and highlight the text (Phase 6 integration)
      // For now, just dispatch a custom event
      window.dispatchEvent(
        new CustomEvent("citation:jump", {
          detail: { pageNumber: citation.pageNumber, text: citation.text },
        }),
      );
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium cursor-pointer transition-colors ${
        citation.type === "web"
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
      }`}
      title={citation.type === "web" ? citation.url : citation.text}
    >
      [{citation.id}]
      {citation.type === "web" ? " 🔗" : " 📄"}
    </button>
  );
}
