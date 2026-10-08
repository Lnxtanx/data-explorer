import { useState, useEffect } from 'react';
import { PostgresIcon } from './DatabaseEngineIcon';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/auth/AuthProvider';
import { ConnectorSidebar } from './ConnectorSidebar';
import { ConnectorOverview } from './ConnectorOverview';
import { ConnectorList } from './ConnectorList';
import { ConnectorSettings } from './ConnectorSettings';
import { ConnectorWizard } from './ConnectorWizard';
import { ConnectorExecutionLogs } from './ConnectorExecutionLogs';
import { ConnectorHealth } from './ConnectorHealth';
import { ConnectorDatabases } from './ConnectorDatabases';

type Tab = 'overview' | 'connectors' | 'databases' | 'logs' | 'settings' | 'health' | 'connect';

interface ConnectorDialogProps {
    open: boolean;
    onClose: () => void;
    initialTab?: Tab;
    onSelectConnection?: (connectionId: string) => void;
}

export function ConnectorDialog({ open, onClose, initialTab = 'overview', onSelectConnection }: ConnectorDialogProps) {
    const { user, signInWithGoogle, signInWithGithub } = useAuth();
    const [activeTab, setActiveTab] = useState<Tab>(initialTab);

    useEffect(() => {
        if (open && initialTab) setActiveTab(initialTab);
    }, [open, initialTab]);

    const handleSelect = (connId: string) => {
        if (onSelectConnection) {
            onSelectConnection(connId);
            onClose();
        }
    };

    if (!user) {
        return (
            <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
                <DialogContent className="max-w-md p-6 overflow-hidden flex flex-col items-center text-center space-y-4">
                    <VisuallyHidden>
                        <DialogTitle>Sign In Required</DialogTitle>
                    </VisuallyHidden>
                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                        <PostgresIcon className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                        <h3 className="text-base font-semibold text-foreground">Sign in required</h3>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto leading-relaxed">
                            Please sign in with Google or GitHub to connect, discover, and manage your PostgreSQL databases.
                        </p>
                    </div>
                    <div className="flex flex-col w-full gap-2.5 pt-2">
                        <Button
                            onClick={() => {
                                signInWithGoogle();
                                onClose();
                            }}
                            variant="outline"
                            className="w-full h-9 text-xs rounded-xl font-medium gap-2 shadow-sm"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                            </svg>
                            Continue with Google
                        </Button>
                        <Button
                            onClick={() => {
                                signInWithGithub();
                                onClose();
                            }}
                            variant="outline"
                            className="w-full h-9 text-xs rounded-xl font-medium gap-2 shadow-sm"
                        >
                            <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                            </svg>
                            Continue with GitHub
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        );
    }

    const renderContent = () => {
        switch (activeTab) {
            case 'overview':
                return <ConnectorOverview onNavigate={(tab) => setActiveTab(tab as Tab)} />;
            case 'connectors':
                return <ConnectorList onSelectConnection={handleSelect} />;
            case 'databases':
                return <ConnectorDatabases onSelectConnection={handleSelect} />;
            case 'logs':
                return <ConnectorExecutionLogs connectionId={null} />;
            case 'settings':
                return <ConnectorSettings />;
            case 'health':
                return <ConnectorHealth />;
            case 'connect':
                return <ConnectorWizard onClose={() => setActiveTab('connectors')} />;
            default:
                return <ConnectorOverview onNavigate={(tab) => setActiveTab(tab as Tab)} />;
        }
    };

    return (
        <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl p-0 gap-0 h-[640px] max-h-[90vh] overflow-hidden flex flex-col">
                <VisuallyHidden>
                    <DialogTitle>Database Connector</DialogTitle>
                </VisuallyHidden>

                <div className="flex flex-1 overflow-hidden min-w-0">
                    <ConnectorSidebar
                        activeSection={activeTab}
                        onSelect={(section) => setActiveTab(section as Tab)}
                    />

                    <div className="flex-1 min-w-0 overflow-y-auto flex flex-col h-full">
                        {renderContent()}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

