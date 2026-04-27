
import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InvitationInfo } from '@/lib/api/projects/collaboration';
import { User, Layers3, Users, Mail, ShieldCheck, LogIn } from 'lucide-react';

interface InvitationReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    invitation: InvitationInfo | null;
    onAccept: () => void;
    onDecline: () => void;
    isAuthenticated: boolean;
    onSignIn: () => void;
    isProcessing: boolean;
}

export function InvitationReviewModal({
    isOpen,
    onClose,
    invitation,
    onAccept,
    onDecline,
    isAuthenticated,
    onSignIn,
    isProcessing,
}: InvitationReviewModalProps) {
    if (!invitation) return null;

    const isTeam = invitation.type === 'team';
    const entityName = isTeam ? invitation.teamName : invitation.projectName;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-width-md">
                <DialogHeader>
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        {isTeam ? <Users className="w-6 h-6 text-primary" /> : <Layers3 className="w-6 h-6 text-primary" />}
                    </div>
                    <DialogTitle className="text-center text-xl">
                        Invitation to join {isTeam ? 'Team' : 'Project'}
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        Review the details below before joining.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-6 space-y-4">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-3 text-sm">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">Invited by:</span>
                            <span className="ml-auto text-muted-foreground">{invitation.inviterName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            {isTeam ? <Users className="w-4 h-4 text-muted-foreground" /> : <Layers3 className="w-4 h-4 text-muted-foreground" />}
                            <span className="font-medium text-foreground">{isTeam ? 'Team Name:' : 'Project Name:'}</span>
                            <span className="ml-auto text-muted-foreground">{entityName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">Your Role:</span>
                            <span className="ml-auto text-muted-foreground capitalize">{invitation.role}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                            <Mail className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-foreground">For Email:</span>
                            <span className="ml-auto text-muted-foreground">{invitation.email}</span>
                        </div>
                    </div>

                    {!isAuthenticated && (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded-md text-sm text-amber-800 flex gap-3">
                            <LogIn className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p>You need to sign in with your Google account to accept this invitation.</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {isAuthenticated ? (
                        <>
                            <Button variant="ghost" onClick={onDecline} disabled={isProcessing}>
                                Decline
                            </Button>
                            <Button onClick={onAccept} disabled={isProcessing} className="flex-1">
                                {isProcessing ? 'Joining...' : 'Accept & Join'}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
                                Later
                            </Button>
                            <Button onClick={onSignIn} className="flex-1 gap-2">
                                <LogIn className="w-4 h-4" />
                                Sign in to Accept
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
