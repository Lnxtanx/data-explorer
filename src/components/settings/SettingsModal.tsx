/**
 * Settings Modal
 *
 * Trimmed for Data Explorer — project and collaboration sections removed.
 * No dependency on file-management or SQL editor modules.
 */

import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from '@/components/ui/dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SettingsSidebar } from './SettingsSidebar';
import { ProfileSettings } from './ProfileSettings';
import { PlansSettings } from './PlansSettings';
import { UsageSettings } from './UsageSettings';
import { AppearanceSettings } from './AppearanceSettings';
import { ShortcutsSettings } from './ShortcutsSettings';
import { DocumentationSettings } from './DocumentationSettings';
import { CollaborationSettings } from './CollaborationSettings';
import { FeedbackSettings } from './FeedbackSettings';
import { SettingsSection } from './types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    user?: User | Partial<User> | null;
    signOut?: () => void;
    signInWithGoogle?: () => void;
    initialSection?: SettingsSection;
}

export function SettingsModal({ isOpen, onClose, user, signOut, signInWithGoogle, initialSection }: SettingsModalProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection ?? 'profile');

    // When modal is reopened with a different initialSection, jump to it
    useEffect(() => {
        if (isOpen && initialSection) setActiveSection(initialSection);
    }, [isOpen, initialSection]);

    const renderContent = () => {
        switch (activeSection) {
            case 'profile':
                return <ProfileSettings user={user as User | null} signOut={signOut} signInWithGoogle={signInWithGoogle} />;
            case 'usage':
                return <UsageSettings />;
            case 'plans':
                return <PlansSettings user={user} />;
            case 'appearance':
                return <AppearanceSettings />;
            case 'shortcuts':
                return <ShortcutsSettings />;
            case 'documentation':
                return <DocumentationSettings />;
            case 'collaboration':
                return <CollaborationSettings />;
            case 'feedback':
                return <FeedbackSettings />;
            default:
                return <ProfileSettings user={user as User | null} signOut={signOut} signInWithGoogle={signInWithGoogle} />;
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl h-[90vh] max-h-[600px] p-0 gap-0 overflow-hidden flex flex-col">
                <VisuallyHidden>
                    <DialogTitle>Settings</DialogTitle>
                </VisuallyHidden>

                <div className="flex flex-1 overflow-hidden">
                    <SettingsSidebar
                        activeSection={activeSection}
                        onSelect={setActiveSection}
                        user={user}
                    />

                    <ScrollArea className="flex-1 [&_[data-radix-scroll-area-thumb]]:w-1 [&_[data-radix-scroll-area-thumb]]:rounded-full">
                        {renderContent()}
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}
