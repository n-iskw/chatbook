import { PdfViewer } from "../components/PdfViewer/PdfViewer";

export function AppPage() {
  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center h-12 px-4 border-b border-gray-200 bg-gray-50 shrink-0">
        <h1 className="text-lg font-bold text-gray-800">chatbook</h1>
      </header>
      <main className="flex-1 min-h-0">
        <PdfViewer />
      </main>
    </div>
  );
}
