/**
 * Feedback Settings (Production v1)
 * 
 * Implements real image uploads to Supabase Storage and 
 * feedback submission to the backend API.
 */

import { useState, useRef } from 'react';
import { Send, CheckCircle2, Upload, X, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
// uploadFile removed - logic moved to backend
import { submitFeedback } from '@/lib/api';

interface FeedbackImage {
    file: File;
    preview: string;
    id: string;
}

export function FeedbackSettings() {
    const [type, setType] = useState<string>('bug');
    const [content, setContent] = useState('');
    const [images, setImages] = useState<FeedbackImage[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (images.length + files.length > 3) {
            toast.error('Maximum 3 images allowed');
            return;
        }

        const newImages = files.map(file => ({
            file,
            preview: URL.createObjectURL(file),
            id: Math.random().toString(36).substring(7)
        }));

        setImages(prev => [...prev, ...newImages]);
    };

    const removeImage = (id: string) => {
        setImages(prev => {
            const removed = prev.find(img => img.id === id);
            if (removed) URL.revokeObjectURL(removed.preview);
            return prev.filter(img => img.id !== id);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        setIsSubmitting(true);
        
        try {
            // 1. Build FormData for multipart request
            const formData = new FormData();
            formData.append('type', type);
            formData.append('content', content);
            
            // 2. Gather browser/OS metadata
            const metadata = {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                screen: `${window.screen.width}x${window.screen.height}`,
                language: navigator.language,
                url: window.location.href,
            };
            formData.append('metadata', JSON.stringify(metadata));

            // 3. Add images
            if (images.length > 0) {
                images.forEach(img => {
                    formData.append('images', img.file);
                });
            }

            // 4. Submit to backend
            await submitFeedback(formData);

            setIsSubmitted(true);
            toast.success('Feedback submitted successfully');
        } catch (error: any) {
            console.error('[Feedback] Submission failed:', error);
            toast.error(error.message || 'Failed to submit feedback');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSubmitted) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center animate-in fade-in duration-300">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                    <CheckCircle2 className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Thank you for your feedback</h3>
                <p className="text-sm text-muted-foreground mt-2 mb-6">
                    We've received your report and will review it shortly.
                </p>
                <Button variant="outline" size="sm" onClick={() => { setIsSubmitted(false); setContent(''); setImages([]); }}>
                    Submit another report
                </Button>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-2xl mx-auto space-y-8">
            <div className="space-y-1">
                <h3 className="text-xl font-semibold">Feedback & Support</h3>
                <p className="text-sm text-muted-foreground">
                    Report a bug or suggest a feature to help us improve Data Explorer.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <Label htmlFor="type" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Category</Label>
                    <Select value={type} onValueChange={setType}>
                        <SelectTrigger id="type" className="w-full h-10 border-border/60">
                            <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="bug">Bug Report</SelectItem>
                            <SelectItem value="feature">Feature Request</SelectItem>
                            <SelectItem value="ui">UI/UX Improvement</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="content" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Description</Label>
                    <Textarea
                        id="content"
                        placeholder="Please provide details about the issue or feature..."
                        className="min-h-[150px] resize-none focus-visible:ring-primary border-border/60"
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-3">
                    <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Attachments (Optional)</Label>
                    <div className="flex flex-wrap gap-3">
                        {images.map((img) => (
                            <div key={img.id} className="relative w-20 h-20 rounded-lg border border-border/60 overflow-hidden shadow-sm">
                                <img src={img.preview} alt="preview" className="w-full h-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => removeImage(img.id)}
                                    className="absolute top-1 right-1 bg-black/60 text-white p-0.5 rounded hover:bg-black/80 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        {images.length < 3 && (
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="w-20 h-20 rounded-lg border border-dashed border-border/60 hover:border-primary/50 hover:bg-muted/30 transition-all flex flex-col items-center justify-center gap-1 text-muted-foreground"
                            >
                                <Upload className="w-4 h-4" />
                                <span className="text-[10px] font-medium uppercase tracking-tighter">Add Photo</span>
                            </button>
                        )}
                    </div>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        accept="image/*"
                        className="hidden"
                        multiple
                    />
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-1">
                        <AlertCircle className="w-3 h-3" />
                        <span>Maximum 3 screenshots allowed.</span>
                    </div>
                </div>

                <Button 
                    type="submit" 
                    className="w-full h-10 font-semibold gap-2 shadow-sm" 
                    disabled={isSubmitting || !content.trim()}
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Submitting...
                        </>
                    ) : (
                        <>
                            <Send className="w-4 h-4" />
                            Submit Feedback
                        </>
                    )}
                </Button>
            </form>
        </div>
    );
}
