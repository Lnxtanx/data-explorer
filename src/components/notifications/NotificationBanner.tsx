import { AlertTriangle, Info, CheckCircle2, XCircle, X, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api/client';
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';

export interface SystemNotification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success' | string;
    message: string;
    link_url?: string | null;
    link_text?: string | null;
}

export function NotificationBanner() {
    const [notification, setNotification] = useState<SystemNotification | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Fetch active notification on mount
        const fetchNotification = async () => {
            try {
                const data = await apiRequest<{ notification?: SystemNotification }>('/api/notifications');
                if (data.notification) {
                    const dismissedIds = JSON.parse(localStorage.getItem('dismissed_notifications') || '[]');
                    if (!dismissedIds.includes(data.notification.id)) {
                        setNotification(data.notification);
                    }
                }
            } catch (error) {
                logger.error('Failed to fetch system notifications:', error);
            }
        };

        fetchNotification();

        // Check for updated notifications periodically (every 5 min)
        const interval = setInterval(fetchNotification, 5 * 60 * 1000);
        return () => {
            clearInterval(interval);
        };
    }, []);

    const handleDismiss = () => {
        if (!notification) return;

        const dismissedIds = JSON.parse(localStorage.getItem('dismissed_notifications') || '[]');
        localStorage.setItem('dismissed_notifications', JSON.stringify([...dismissedIds, notification.id]));
        setIsDismissed(true);
    };

    if (!notification || isDismissed) {
        return null;
    }

    const t = (notification.type || '').toLowerCase();
    const m = (notification.message || '').toLowerCase();

    // Solid, bold color themes strictly mapped to notification type and content
    const isWarningOrTesting = t === 'warning' || m.includes('test') || m.includes('beta') || m.includes('preview');
    const isError = t === 'error' || t === 'critical';
    const isSuccess = t === 'success';

    let bannerBg = 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white';
    let icon = <Info className="w-4 h-4 shrink-0 text-white/90" />;
    let linkButtonClass = 'bg-white text-blue-700 hover:bg-white/90';

    if (isWarningOrTesting) {
        bannerBg = 'bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white';
        icon = <AlertTriangle className="w-4 h-4 shrink-0 text-white/90" />;
        linkButtonClass = 'bg-white text-orange-600 hover:bg-white/90';
    } else if (isError) {
        bannerBg = 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-600 text-white';
        icon = <XCircle className="w-4 h-4 shrink-0 text-white/90" />;
        linkButtonClass = 'bg-white text-rose-700 hover:bg-white/90';
    } else if (isSuccess) {
        bannerBg = 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 text-white';
        icon = <CheckCircle2 className="w-4 h-4 shrink-0 text-white/90" />;
        linkButtonClass = 'bg-white text-emerald-700 hover:bg-white/90';
    }

    return (
        <aside
            role="banner"
            aria-label="System notification"
            className={cn(
                "w-full px-4 py-2 flex items-center justify-center text-xs z-50 shrink-0 select-none shadow-xs border-b border-black/10 relative",
                bannerBg
            )}
        >
            <div className="flex items-center justify-center gap-2 max-w-4xl text-center px-6">
                {icon}
                <span className="font-medium text-[13px] text-white tracking-normal">
                    {notification.message}
                </span>

                {notification.link_url && (
                    <a
                        href={notification.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "inline-flex items-center gap-1 font-semibold text-xs px-2.5 py-0.5 rounded-full transition-all duration-150 shadow-xs shrink-0 ml-1.5",
                            linkButtonClass
                        )}
                    >
                        <span>{notification.link_text || 'Learn more'}</span>
                        <ArrowRight className="w-3 h-3" />
                    </a>
                )}
            </div>

            <button
                type="button"
                onClick={handleDismiss}
                className="h-6 w-6 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-all cursor-pointer absolute right-3 shrink-0"
                aria-label="Dismiss notification"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </aside>
    );
}
