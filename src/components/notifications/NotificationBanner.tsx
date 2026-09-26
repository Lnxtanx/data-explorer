import { AlertTriangle, Info, CheckCircle2, XCircle, X, Sparkles, Megaphone, MessageSquare, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api/client';
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';

export interface SystemNotification {
    id: string;
    type: string;
    message: string;
    link_url?: string;
    link_text?: string;
}

export type NotificationCategory = 'testing' | 'news' | 'feedback' | 'warning' | 'error' | 'success' | 'info';

interface CategoryConfig {
    badge: string;
    icon: React.ReactNode;
    bannerStyle: string;
    badgeStyle: string;
    buttonStyle: string;
}

export function resolveNotificationCategory(type?: string, message?: string): NotificationCategory {
    const t = (type || '').toLowerCase().trim();
    const m = (message || '').toLowerCase();

    // 1. Explicit type check
    if (t === 'testing' || t === 'beta' || t === 'test') return 'testing';
    if (t === 'news' || t === 'announcement' || t === 'update' || t === 'release') return 'news';
    if (t === 'feedback' || t === 'survey') return 'feedback';
    if (t === 'warning' || t === 'maintenance') return 'warning';
    if (t === 'error' || t === 'critical' || t === 'outage') return 'error';
    if (t === 'success') return 'success';

    // 2. Intelligent heuristics for 'info' or custom message strings
    if (m.includes('test') || m.includes('beta') || m.includes('preview')) return 'testing';
    if (m.includes('feedback') || m.includes('survey') || m.includes('thoughts')) return 'feedback';
    if (m.includes('new ') || m.includes('launch') || m.includes('announc') || m.includes('release')) return 'news';
    if (m.includes('maintenance') || m.includes('downtime') || m.includes('incident') || m.includes('investigat')) return 'warning';
    if (m.includes('outage') || m.includes('degraded')) return 'error';

    return 'info';
}

const CATEGORY_CONFIGS: Record<NotificationCategory, CategoryConfig> = {
    testing: {
        badge: 'Testing Phase',
        icon: <Sparkles className="w-3.5 h-3.5 text-amber-200 shrink-0 animate-pulse" />,
        bannerStyle: 'bg-gradient-to-r from-orange-600 via-amber-500 to-orange-600 text-white shadow-xs border-b border-orange-700/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-orange-600 hover:bg-white/90',
    },
    news: {
        badge: 'New Update',
        icon: <Megaphone className="w-3.5 h-3.5 text-purple-200 shrink-0" />,
        bannerStyle: 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white shadow-xs border-b border-indigo-800/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-indigo-700 hover:bg-white/90',
    },
    feedback: {
        badge: 'Feedback',
        icon: <MessageSquare className="w-3.5 h-3.5 text-teal-200 shrink-0" />,
        bannerStyle: 'bg-gradient-to-r from-teal-600 via-emerald-600 to-teal-700 text-white shadow-xs border-b border-teal-800/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-teal-700 hover:bg-white/90',
    },
    warning: {
        badge: 'Notice',
        icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-200 shrink-0" />,
        bannerStyle: 'bg-gradient-to-r from-amber-600 via-orange-600 to-amber-700 text-white shadow-xs border-b border-amber-800/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-amber-800 hover:bg-white/90',
    },
    error: {
        badge: 'System Alert',
        icon: <XCircle className="w-3.5 h-3.5 text-rose-200 shrink-0" />,
        bannerStyle: 'bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 text-white shadow-xs border-b border-rose-800/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-rose-700 hover:bg-white/90',
    },
    success: {
        badge: 'All Systems Operational',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200 shrink-0" />,
        bannerStyle: 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-xs border-b border-emerald-800/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-emerald-700 hover:bg-white/90',
    },
    info: {
        badge: 'Announcement',
        icon: <Info className="w-3.5 h-3.5 text-blue-200 shrink-0" />,
        bannerStyle: 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-xs border-b border-blue-800/30',
        badgeStyle: 'bg-black/25 text-white border-white/20',
        buttonStyle: 'bg-white text-blue-700 hover:bg-white/90',
    },
};

export function NotificationBanner() {
    const [notification, setNotification] = useState<SystemNotification | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Fetch active notification on mount
        const fetchNotification = async () => {
            try {
                const data = await apiRequest<{ notification?: SystemNotification }>('/api/notifications');
                if (data.notification) {
                    // Check if user already dismissed this specific notification
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

        // Poll every 5 minutes for updated system notifications
        const interval = setInterval(fetchNotification, 5 * 60 * 1000);
        return () => {
            clearInterval(interval);
        };
    }, []);

    const handleDismiss = () => {
        if (!notification) return;

        // Save to local storage so it doesn't reappear
        const dismissedIds = JSON.parse(localStorage.getItem('dismissed_notifications') || '[]');
        localStorage.setItem('dismissed_notifications', JSON.stringify([...dismissedIds, notification.id]));

        setIsDismissed(true);
    };

    if (!notification || isDismissed) {
        return null;
    }

    const category = resolveNotificationCategory(notification.type, notification.message);
    const config = CATEGORY_CONFIGS[category] || CATEGORY_CONFIGS.info;

    return (
        <aside
            role="banner"
            aria-label="System notification"
            className={cn(
                "w-full px-4 py-1.5 flex items-center justify-between text-xs z-50 animate-in slide-in-from-top-2 duration-300 relative shrink-0 select-none",
                config.bannerStyle
            )}
        >
            <div className="flex-1 flex items-center justify-center gap-2.5 min-w-0 pr-8">
                <div className="flex items-center gap-1.5 shrink-0">
                    {config.icon}
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-xs border shadow-xs",
                        config.badgeStyle
                    )}>
                        {config.badge}
                    </span>
                </div>

                <span className="font-medium text-[13px] text-white/95 truncate">
                    {notification.message}
                </span>

                {notification.link_url && (
                    <a
                        href={notification.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={cn(
                            "inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full transition-all duration-150 shrink-0",
                            config.buttonStyle
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
