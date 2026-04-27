import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, CheckCircle2, XCircle, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { API_BASE_URL } from '@/lib/api';

export interface SystemNotification {
    id: string;
    type: 'info' | 'warning' | 'error' | 'success';
    message: string;
    link_url?: string;
    link_text?: string;
}

export function NotificationBanner() {
    const [notification, setNotification] = useState<SystemNotification | null>(null);
    const [isDismissed, setIsDismissed] = useState(false);

    useEffect(() => {
        // Fetch active notification on mount
        const fetchNotification = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/notifications`);
                if (!response.ok) return;

                const data = await response.json();
                if (data.notification) {
                    // Check if user already dismissed this specific notification
                    const dismissedIds = JSON.parse(localStorage.getItem('dismissed_notifications') || '[]');
                    if (!dismissedIds.includes(data.notification.id)) {
                        setNotification(data.notification);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch system notifications:', error);
            }
        };

        fetchNotification();

        // Auto-dismiss after 6 seconds if not already dismissed
        const dismissTimer = setTimeout(() => {
            setIsDismissed(true);
        }, 6000);

        // Optional: Poll every 5 minutes for new notifications
        const interval = setInterval(fetchNotification, 5 * 60 * 1000);
        return () => {
            clearInterval(interval);
            clearTimeout(dismissTimer);
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

    const icons = {
        info: <Info className="h-4 w-4" />,
        warning: <AlertTriangle className="h-4 w-4" />,
        error: <XCircle className="h-4 w-4" />,
        success: <CheckCircle2 className="h-4 w-4" />
    };

    const variants = {
        info: "bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-500/20",
        warning: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400 border-amber-500/20",
        error: "bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400 border-red-500/20",
        success: "bg-green-500/10 text-green-600 dark:bg-green-500/20 dark:text-green-400 border-green-500/20"
    };

    return (
        <div className={cn(
            "w-full px-4 py-2 border-b flex items-center justify-center gap-3 text-sm z-50 animate-in slide-in-from-top-2 relative shrink-0",
            variants[notification.type] || variants.info
        )}>
            <div className="flex items-center gap-2">
                {icons[notification.type]}
                <span className="font-medium">{notification.message}</span>
            </div>

            {notification.link_url && (
                <a
                    href={notification.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 underline underline-offset-4 hover:opacity-80 transition-opacity whitespace-nowrap"
                >
                    {notification.link_text || 'Learn more'}
                </a>
            )}

            <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 absolute right-2 opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                onClick={handleDismiss}
            >
                <X className="h-4 w-4" />
                <span className="sr-only">Dismiss</span>
            </Button>
        </div>
    );
}
