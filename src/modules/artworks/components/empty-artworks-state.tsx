
import { Upload, FileLock2, Download } from "lucide-react";

export function EmptyArtworksState() {
    return (
        <div className="flex flex-col items-center justify-center py-8 px-6 max-w-sm mx-auto animate-in fade-in zoom-in duration-500 bg-white rounded-2xl border border-gray-100 shadow-sm -mt-10">
            
            <h3 className="text-lg font-bold text-gray-900 mb-2 text-center">
                Welcome to Drimit
            </h3>
            <p className="text-gray-500 text-center mb-8 text-sm leading-relaxed">
                Protect your first artwork in 3 simple steps:
            </p>

            <div className="w-full space-y-6 relative pl-2">
                {/* Connecting Line */}
                <div className="absolute left-[1.35rem] top-2 bottom-8 w-px bg-gray-200 -z-10" />

                <div className="flex items-start gap-4 relative">
                    <div className="bg-white z-10 p-1">
                        <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-gray-700" />
                        </div>
                    </div>
                    <div className="pt-1.5">
                        <h4 className="font-semibold text-gray-900 text-sm">Upload</h4>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                            Upload your high-res artwork (PNG/JPG).
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4 relative">
                     <div className="bg-white z-10 p-1">
                        <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
                            <FileLock2 className="w-5 h-5 text-gray-700" />
                        </div>
                    </div>
                    <div className="pt-1.5">
                        <h4 className="font-semibold text-gray-900 text-sm">Protect</h4>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                            Apply <b>AI protection</b> or Watermark.
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-4 relative">
                     <div className="bg-white z-10 p-1">
                         <div className="w-8 h-8 rounded-full bg-gray-50 border border-gray-100 flex items-center justify-center">
                            <Download className="w-5 h-5 text-gray-700" />
                        </div>
                    </div>
                    <div className="pt-1.5">
                        <h4 className="font-semibold text-gray-900 text-sm">Download</h4>
                        <p className="text-xs text-gray-500 mt-0.5 leading-snug">
                            Get your protected, AI-confusing asset.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
