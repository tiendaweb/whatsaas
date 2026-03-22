import React from 'react';
import { 
    Image as ImageIcon, 
    FileText, 
    Video as VideoIcon 
} from 'lucide-react';

export function mapComponentsToPreview(components: any[]) {
    if (!components) return { headerType: 'NONE', headerText: '', bodyText: '', footerText: '', buttons: [] };

    const header = components.find((c: any) => c.type === 'HEADER');
    const body = components.find((c: any) => c.type === 'BODY');
    const footer = components.find((c: any) => c.type === 'FOOTER');
    const buttonsComp = components.find((c: any) => c.type === 'BUTTONS');

    return {
        headerType: header?.format || 'NONE',
        headerText: header?.text || '',
        bodyText: body?.text || '',
        footerText: footer?.text || '',
        buttons: buttonsComp?.buttons || []
    };
}

export function WhatsAppPreview({ 
    data, 
    headerType, headerText, bodyText, footerText, buttons 
}: any) {
    
    const content = data ? mapComponentsToPreview(data) : {
        headerType, headerText, bodyText, footerText, buttons
    };

    return (
        <div className="w-[320px] mx-auto bg-[#E5DDD5] rounded-[30px] overflow-hidden shadow-xl border-[6px] border-gray-800 h-[580px] relative flex flex-col font-sans shrink-0">
            <div className="bg-[#075E54] h-14 flex items-center px-4 shrink-0 shadow-sm z-10">
                <div className="w-8 h-8 rounded-full bg-white/20 mr-3 flex items-center justify-center text-white text-xs">A</div>
                <div className="flex-1">
                    <div className="h-2 bg-white/40 w-20 rounded mb-1"></div>
                </div>
            </div>

            <div className="flex-1 p-3 overflow-y-auto bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] flex flex-col">
                <div className="bg-white rounded-lg p-1 shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] max-w-[90%] w-full self-start rounded-tl-none relative mb-2">
                    <div className="p-1.5 space-y-1.5">
                        {content.headerType === 'TEXT' && content.headerText && (
                            <p className="font-bold text-sm text-gray-900 px-1 pt-1">{content.headerText}</p>
                        )}
                        {content.headerType === 'IMAGE' && (
                            <div className="h-32 bg-gray-100 rounded-md flex items-center justify-center text-gray-400">
                                <ImageIcon className="h-8 w-8 opacity-50" />
                            </div>
                        )}
                        {content.headerType === 'VIDEO' && (
                            <div className="h-32 bg-gray-100 rounded-md flex items-center justify-center text-gray-400">
                                <VideoIcon className="h-8 w-8 opacity-50" />
                            </div>
                        )}
                        {content.headerType === 'DOCUMENT' && (
                            <div className="h-12 bg-gray-50 rounded-md flex items-center justify-center text-gray-500 border border-gray-100">
                                <FileText className="h-5 w-5 mr-2 opacity-50" /> <span className="text-xs">Document.pdf</span>
                            </div>
                        )}

                        <p className="text-[13.5px] leading-relaxed text-gray-800 whitespace-pre-wrap px-1 min-h-[20px]">
                            {content.bodyText || "Message..."}
                        </p>

                        {content.footerText && (
                            <p className="text-[11px] text-gray-400 pt-1 px-1">{content.footerText}</p>
                        )}
                    </div>

                    <div className="flex justify-end px-1 pb-1">
                        <span className="text-[10px] text-gray-400">12:00</span>
                    </div>
                </div>

                {content.buttons && content.buttons.length > 0 && (
                    <div className="flex flex-col gap-2 max-w-[90%] self-start w-full">
                        {content.buttons.map((btn: any, idx: number) => (
                            <div key={idx} className="bg-white h-9 rounded-lg shadow-[0_1px_0.5px_rgba(0,0,0,0.13)] flex items-center justify-center text-[#00A884] text-sm font-medium cursor-pointer hover:bg-gray-50 transition-colors">
                                {btn.type === 'PHONE_NUMBER' && "📞 "}
                                {btn.type === 'URL' && "🔗 "}
                                {btn.text}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}