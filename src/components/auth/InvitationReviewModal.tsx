
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
import { User, Layers3, Users, Mail, ShieldCheck, LogIn, Clock, AlertTriangle } from 'lucide-react';

interface InvitationReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    invitation: InvitationInfo | null;
    onAccept: () => void;
    onDecline: () => void;
    isAuthenticated: boolean;
    currentUserEmail?: string | null;
    onSignIn: () => void;
    isProcessing: boolean;
}

const normalizeEmail = (value: string | null | undefined) =>
    (value || '').trim().toLowerCase();

export function InvitationReviewModal({
    isOpen,
    onClose,
    invitation,
    onAccept,
    onDecline,
    isAuthenticated,
    currentUserEmail,
    onSignIn,
    isProcessing,
}: InvitationReviewModalProps) {
    if (!invitation) return null;

    const isTeam = invitation.type === 'team';
    const entityName = isTeam ? invitation.teamName : invitation.projectName;

    const isExpired = invitation.expired === true;
    const isWrongAccount =
        !isExpired &&
        isAuthenticated &&
        !!currentUserEmail &&
        normalizeEmail(currentUserEmail) !== normalizeEmail(invitation.email);

    const canAccept = isAuthenticated && !isExpired && !isWrongAccount;

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
                            <Mail className={`w-4 h-4 ${isWrongAccount ? 'text-amber-600' : 'text-muted-foreground'}`} />
                            <span className="font-medium text-foreground">For Email:</span>
                            <span className={`ml-auto ${isWrongAccount ? 'text-amber-700 font-medium' : 'text-muted-foreground'}`}>{invitation.email}</span>
                        </div>
                    </div>

                    {isExpired && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 rounded-md text-sm text-red-800 dark:text-red-300 flex gap-3">
                            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p>This invitation has expired. Ask the person who invited you to send a new one.</p>
                        </div>
                    )}

                    {!isExpired && isWrongAccount && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-md text-sm text-amber-800 dark:text-amber-300 flex gap-3">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p>
                                You're signed in as <strong>{currentUserEmail}</strong>, but this invitation was sent to{' '}
                                <strong>{invitation.email}</strong>. Sign out and sign in with that address to accept it.
                            </p>
                        </div>
                    )}

                    {!isExpired && !isAuthenticated && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/50 rounded-md text-sm text-amber-800 dark:text-amber-300 flex gap-3">
                            <LogIn className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <p>
                                Sign in with <strong>{invitation.email}</strong> to accept this invitation.
                                Don't have an account? Signing up with that address will use your reserved spot.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter className="flex-col sm:flex-row gap-2">
                    {canAccept ? (
                        <>
                            <Button variant="ghost" onClick={onDecline} disabled={isProcessing}>
                                Decline
                            </Button>
                            <Button onClick={onAccept} disabled={isProcessing} className="flex-1">
                                {isProcessing ? 'Joining...' : 'Accept & Join'}
                            </Button>
                        </>
                    ) : isExpired ? (
                        <>
                            <Button variant="ghost" onClick={onClose} disabled={isProcessing}>
                                Close
                            </Button>
                            <Button variant="destructive" disabled className="flex-1 opacity-70">
                                Expired
                            </Button>
                        </>
                    ) : isWrongAccount ? (
                        <>
                            <Button variant="ghost" onClick={onDecline} disabled={isProcessing}>
                                Decline
                            </Button>
                            <Button disabled className="flex-1 opacity-70">
                                Wrong Account
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
