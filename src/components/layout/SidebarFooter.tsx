import { Settings, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/components/auth/AuthProvider";
import { useUserProfile } from "@/hooks/useUserProfile";


interface SidebarFooterProps {
    onOpenSettings?: () => void;
    onOpenAI?: () => void;
    isAiMode?: boolean;
    isCollapsed?: boolean;
}

export function SidebarFooter({ onOpenSettings, onOpenAI, isAiMode, isCollapsed }: SidebarFooterProps) {
    const { user } = useAuth();
    const { profile } = useUserProfile();

    return (
        <div className={cn(
            "flex items-center border-t border-border mt-auto transition-all duration-300",
            isCollapsed ? "flex-col py-3 gap-4" : "justify-between py-1"
        )}>
            {/* Left side: Resona AI */}
            <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "px-2 text-xs font-semibold transition-all duration-300 shrink-0",
                            isAiMode 
                                ? "bg-primary/10 text-primary border border-primary/30 backdrop-blur-md shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent hover:border-border/30 hover:shadow-sm",
                            isCollapsed ? "h-8 w-8 p-0 rounded-lg justify-center" : "h-8 gap-2"
                        )}
                        onClick={onOpenAI}
                    >
                        {isAiMode ? (
                            <>
                                <Database className="w-4 h-4" />
                                {!isCollapsed && "Data Explorer"}
                            </>
                        ) : (
                            <>
                                <img src="/resona.png" alt="Resona AI" className="w-4 h-4" />
                                {!isCollapsed && "Resona AI"}
                            </>
                        )}
                    </Button>
                </TooltipTrigger>
                {isCollapsed && (
                    <TooltipContent side="right" className="font-medium text-xs">
                        {isAiMode ? "Data Explorer" : "Resona AI"}
                    </TooltipContent>
                )}
            </Tooltip>

            {/* Right side actions */}
            <div className={cn("flex items-center", isCollapsed ? "flex-col" : "gap-1")}>
                {/* Settings */}
                <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground opacity-70 hover:opacity-100"
                            onClick={onOpenSettings}
                        >
                            {user && (profile?.avatar_url || user.user_metadata.avatar_url) ? (
                                <img
                                    src={profile?.avatar_url || user.user_metadata.avatar_url}
                                    alt="Profile"
                                    className="h-5 w-5 rounded-full object-cover border border-border/50"
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
            </div>
        </div>
    );
}
