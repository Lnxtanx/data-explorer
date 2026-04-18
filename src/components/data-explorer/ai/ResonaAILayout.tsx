import { useState } from 'react';
import { AIChatSidebar } from './AIChatSidebar';
import { AIChatMain } from './AIChatMain';

interface ResonaAILayoutProps {
    onCloseAI: () => void;
}

export function ResonaAILayout({ onCloseAI }: ResonaAILayoutProps) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    return (
        <div className="flex w-full h-full bg-background overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <AIChatSidebar
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
                onCloseAI={onCloseAI}
            />
            <AIChatMain />
        </div>
    );
}
