import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            {children}
        </h4>
    );
}

export function RoleBadge({ role }: { role: string }) {
    return (
        <Badge variant="secondary" className="text-[10px] font-medium uppercase px-2 py-0.5">
            {role}
        </Badge>
    );
}

interface ConfirmActionProps {
    trigger: React.ReactNode;
    title: string;
    description: string;
    confirmLabel?: string;
    onConfirm: () => void;
    processing?: boolean;
    extraGuard?: React.ReactNode;
    confirmEnabled?: boolean;
}

export function ConfirmAction({
    trigger, title, description, confirmLabel = 'Confirm',
    onConfirm, processing, extraGuard, confirmEnabled = true,
}: ConfirmActionProps) {
    const [open, setOpen] = useState(false);
    return (
        <AlertDialog open={open} onOpenChange={setOpen}>
            <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle className="text-base">{title}</AlertDialogTitle>
                    <AlertDialogDescription className="text-sm leading-relaxed">
                        {description}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                {extraGuard}
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={processing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            setOpen(false);
                            onConfirm();
                        }}
                        disabled={processing || !confirmEnabled}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
