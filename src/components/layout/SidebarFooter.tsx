import { Settings, Database, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserProfile } from "../auth/hooks/useUserProfile";
import { PremiumAvatar } from "../billing/components/PremiumAvatar";
import { VIEW_MODE_LABEL, type ViewMode } from "@/lib/view-mode";


interface SidebarFooterProps {
    onOpenSettings?: () => void;
    mode: ViewMode;
    onModeChange: (mode: ViewMode) => void;
    isCollapsed?: boolean;
}

function ModeIcon({ mode }: { mode: ViewMode }) {
    if (mode === 'ai') {
        return <img src="/resona.png" alt="Resona AI" className="w-3.5 h-3.5 object-contain shrink-0" />;
    }
    if (mode === 'dashboard') {
        return <BarChart3 className="w-3.5 h-3.5 shrink-0" />;
    }
    return <Database className="w-3.5 h-3.5 shrink-0" />;
}

export function SidebarFooter({ onOpenSettings, mode, onModeChange, isCollapsed }: SidebarFooterProps) {
    const { user } = useAuth();
    const { profile, planId } = useUserProfile();

    const ALL_MODES: ViewMode[] = ['explorer', 'ai', 'dashboard'];
    const availableModes = ALL_MODES.filter(m => m !== mode);

    const SHORT_LABEL: Record<ViewMode, string> = {
        explorer: 'Explorer',
        ai: 'Resona AI',
        dashboard: 'Dashboard',
    };

    const modeButton = (m: ViewMode) => {
        return (
            <Tooltip delayDuration={0} key={m}>
                <TooltipTrigger asChild>
                    <button
                        type="button"
                        onClick={() => onModeChange(m)}
                        className={cn(
                            "flex items-center justify-center gap-1 rounded-md text-xs font-medium tracking-tight transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-transparent hover:border-border/40 min-w-0",
                            isCollapsed ? "h-8 w-8 rounded-lg" : "h-7 flex-1 px-1.5"
                        )}
                        aria-label={`Switch to ${VIEW_MODE_LABEL[m]}`}
                    >
                        <ModeIcon mode={m} />
                        {!isCollapsed && <span className="whitespace-nowrap">{SHORT_LABEL[m]}</span>}
                    </button>
                </TooltipTrigger>
                <TooltipContent side={isCollapsed ? "right" : "top"} className="font-medium text-xs">
                    {VIEW_MODE_LABEL[m]}
                </TooltipContent>
            </Tooltip>
        );
    };

    const settingsButton = (
        <Tooltip delayDuration={0} key="settings">
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-foreground/80 hover:text-foreground hover:bg-muted/60 flex items-center justify-center shrink-0"
                    onClick={onOpenSettings}
                >
                    {user && (profile?.avatar_url || user.user_metadata.avatar_url) ? (
                        <PremiumAvatar
                            avatarUrl={profile?.avatar_url || user.user_metadata.avatar_url}
                            initials={profile?.email?.[0]?.toUpperCase() || 'U'}
                            planId={planId}
                            size="sm"
                            shape="circle"
                        />
                    ) : (
                        <>
                            <Settings className="h-4 w-4" strokeWidth={1.5} />
                            <span className="sr-only">Settings</span>
                        </>
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side={isCollapsed ? "right" : "top"} className="font-medium text-xs">
                Settings
            </TooltipContent>
        </Tooltip>
    );

    return (
        <div className={cn(
            "flex items-center border-t border-border mt-auto transition-all duration-300 w-full",
            isCollapsed ? "flex-col py-3 gap-3" : "py-1.5 px-2 gap-1.5"
        )}>
            {isCollapsed ? (
                <>
                    {availableModes.map(modeButton)}
                    {settingsButton}
                </>
            ) : (
                <>
                    <div className="flex-1 min-w-0 grid grid-cols-2 gap-1">
                        {availableModes.map(modeButton)}
                    </div>
                    {settingsButton}
                </>
            )}
        </div>
    );
}